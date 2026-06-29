import { logger } from "@real-router/logger";
import { nodeToDefinition } from "route-tree";

import { throwIfDisposed, throwIfReentrantTreeMutation } from "./helpers";
import { guardRouteStructure } from "../guards";
import { getInternals } from "../internals";
import { STANDARD_ROUTE_KEYS } from "../namespaces/RoutesNamespace/constants";
import {
  clearConfigEntries,
  removeFromDefinitions,
} from "../namespaces/RoutesNamespace/helpers";
import {
  validateClearRoutes,
  validateRemoveRoute,
} from "../namespaces/RoutesNamespace/routeGuards";
import {
  adoptRouteArtifacts,
  assertAddable,
  assertForwardToNotAsync,
  assertNoDuplicateNamesInBatch,
  buildAddArtifacts,
  buildReplaceArtifacts,
  commitTreeChanges,
  refreshForwardMap,
  resetStore,
} from "../namespaces/RoutesNamespace/routesStore";

import type { RoutesApi } from "./types";
import type { RouterInternals } from "../internals";
import type { RouteLifecycleNamespace, RouteConfig } from "../namespaces";
import type { RoutesStore } from "../namespaces/RoutesNamespace";
import type { GuardFnFactory, Route } from "../types";
import type {
  DefaultDependencies,
  ForwardToCallback,
  GuardFn,
  NavigationOptions,
  Params,
  RouteConfigUpdate,
  Router,
  State,
  TreeChangedEvent,
  TreeStructuralPatch,
} from "@real-router/types";
import type { RouteDefinition, RouteTree } from "route-tree";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Opts attached to the `TRANSITION_SUCCESS` emitted by `replace()` when it
 * revalidates the active state (#950). `replace` does not push history, so it
 * is a replace-type success — matching `navigateToNotFound`'s opts for the
 * dropped-route branch.
 */
const REVALIDATE_OPTS: NavigationOptions = Object.freeze({ replace: true });

/**
 * Clears all config entries and lifecycle handlers for a removed route
 * (and all its descendants).
 */
function clearRouteConfigurations<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  routeName: string,
  config: RouteConfig,
  routeCustomFields: Record<string, Record<string, unknown>>,
  lifecycleNamespace: RouteLifecycleNamespace<Dependencies>,
): void {
  const shouldClear = (name: string): boolean =>
    name === routeName || name.startsWith(`${routeName}.`);

  clearConfigEntries(config.decoders, shouldClear);
  clearConfigEntries(config.encoders, shouldClear);
  clearConfigEntries(config.defaultParams, shouldClear);
  clearConfigEntries(config.forwardMap, shouldClear);
  clearConfigEntries(config.forwardFnMap, shouldClear);
  clearConfigEntries(routeCustomFields, shouldClear);

  // Clear forwardMap entries pointing TO the deleted route (or its descendants)
  clearConfigEntries(config.forwardMap, (key) =>
    shouldClear(config.forwardMap[key]),
  );

  // Clear lifecycle handlers
  const [canDeactivateFactories, canActivateFactories] =
    lifecycleNamespace.getFactories();

  for (const name of Object.keys(canActivateFactories)) {
    if (shouldClear(name)) {
      lifecycleNamespace.clearCanActivate(name);
    }
  }

  for (const name of Object.keys(canDeactivateFactories)) {
    if (shouldClear(name)) {
      lifecycleNamespace.clearCanDeactivate(name);
    }
  }
}

/**
 * PREPARE step for a `forwardTo` update (#951 atomicity): computes the new
 * forward maps and the resolved forward chain into LOCALS and returns them
 * WITHOUT touching the store. A throw here — an async `forwardTo` (#967) or a
 * cycle surfaced by `refreshForwardMap` — aborts `update()` before any field is
 * committed. The caller writes the returned bundle into the store in its COMMIT
 * phase. (Mirrors the build-then-swap shape of #698, but the swap is deferred to
 * the caller so it can be sequenced with the other prepared fields.)
 */
function prepareForwardTo<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  name: string,
  forwardTo: string | ForwardToCallback<Dependencies> | null,
  config: RouteConfig,
): {
  forwardMap: RouteConfig["forwardMap"];
  forwardFnMap: RouteConfig["forwardFnMap"];
  resolved: Record<string, string>;
} {
  // #967: reject an async forwardTo at update time — parity with add/replace
  // (registerForwardTo runs the same check on the build path). A no-op for
  // string/null. Without this the async callback is stored silently and
  // surfaces later as a generic "must return a string, got object" TypeError
  // from #resolveDynamicForward at navigation. Runs first, before any clone.
  assertForwardToNotAsync(forwardTo, name);

  const forwardMap = Object.assign(
    Object.create(null) as RouteConfig["forwardMap"],
    config.forwardMap,
  );
  const forwardFnMap = Object.assign(
    Object.create(null) as RouteConfig["forwardFnMap"],
    config.forwardFnMap,
  );

  if (forwardTo === null) {
    delete forwardMap[name];
    delete forwardFnMap[name];
  } else if (typeof forwardTo === "string") {
    delete forwardFnMap[name];
    forwardMap[name] = forwardTo;
  } else {
    delete forwardMap[name];
    forwardFnMap[name] = forwardTo;
  }

  const resolved = refreshForwardMap({ ...config, forwardMap });

  return { forwardMap, forwardFnMap, resolved };
}

/**
 * Re-attaches the stored config (forwardTo / defaultParams / encode-decode) and
 * lifecycle guards for `lookupName` onto `route`, then returns it (mutates in
 * place). Shared by {@link enrichRoute} (nested, bare `name`) and
 * {@link buildFlatRoute} (flat, full dotted `name`) — one source of truth for
 * the route-config field set.
 */
function assignRouteConfig<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  route: Route<Dependencies>,
  lookupName: string,
  config: RouteConfig,
  factories: [
    Record<string, GuardFnFactory<Dependencies>>,
    Record<string, GuardFnFactory<Dependencies>>,
  ],
): Route<Dependencies> {
  const forwardToFn = config.forwardFnMap[lookupName];
  const forwardToStr = config.forwardMap[lookupName];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (forwardToFn !== undefined) {
    route.forwardTo = forwardToFn;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  } else if (forwardToStr !== undefined) {
    route.forwardTo = forwardToStr;
  }

  if (lookupName in config.defaultParams) {
    route.defaultParams = config.defaultParams[lookupName];
  }

  if (lookupName in config.decoders) {
    route.decodeParams = config.decoders[lookupName];
  }

  if (lookupName in config.encoders) {
    route.encodeParams = config.encoders[lookupName];
  }

  const [canDeactivateFactories, canActivateFactories] = factories;

  if (lookupName in canActivateFactories) {
    route.canActivate = canActivateFactories[lookupName];
  }

  if (lookupName in canDeactivateFactories) {
    route.canDeactivate = canDeactivateFactories[lookupName];
  }

  return route;
}

/**
 * Builds a full Route object from a bare RouteDefinition by re-attaching
 * config entries and lifecycle factories.
 *
 * RECURSIVE — call with the factories tuple obtained ONCE from
 * `lifecycleNamespace.getFactories()` and pass it through to children.
 */
function enrichRoute<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  routeDef: RouteDefinition,
  routeName: string,
  config: RouteConfig,
  factories: [
    Record<string, GuardFnFactory<Dependencies>>,
    Record<string, GuardFnFactory<Dependencies>>,
  ],
): Route<Dependencies> {
  const route: Route<Dependencies> = {
    name: routeDef.name,
    path: routeDef.path,
  };

  assignRouteConfig(route, routeName, config, factories);

  if (routeDef.children) {
    route.children = routeDef.children.map((child) =>
      enrichRoute(child, `${routeName}.${child.name}`, config, factories),
    );
  }

  return route;
}

// ============================================================================
// TREE_CHANGED payload helpers
// ============================================================================

/**
 * Builds a single FLAT `Route` for `fullName` from the store config + lifecycle
 * factories — `name` is the FULL dotted name and there is no `children` array
 * (consumers want a flat, by-name list). Frozen on construction.
 */
function buildFlatRoute<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  fullName: string,
  path: string,
  config: RouteConfig,
  factories: [
    Record<string, GuardFnFactory<Dependencies>>,
    Record<string, GuardFnFactory<Dependencies>>,
  ],
): Route<Dependencies> {
  const route: Route<Dependencies> = { name: fullName, path };

  assignRouteConfig(route, fullName, config, factories);

  return Object.freeze(route);
}

/**
 * Walks the store's definitions depth-first, building a FLAT
 * `Map<fullName, Route>` for every node whose full dotted name satisfies
 * `include`. Reads the live store, so call it at the right moment relative to
 * the mutation (before for removed, after for added).
 */
function collectFlatRoutes<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  include: (fullName: string) => boolean,
): Map<string, Route<Dependencies>> {
  const result = new Map<string, Route<Dependencies>>();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
  const factories = store.lifecycleNamespace!.getFactories();

  const walk = (defs: readonly RouteDefinition[], parentName: string): void => {
    for (const def of defs) {
      const fullName = parentName ? `${parentName}.${def.name}` : def.name;

      if (include(fullName)) {
        result.set(
          fullName,
          buildFlatRoute(fullName, def.path, store.config, factories),
        );
      }

      if (def.children) {
        walk(def.children, fullName);
      }
    }
  };

  walk(store.definitions, "");

  return result;
}

/**
 * Collects the route `name` and all of its descendants as a FLAT, frozen array.
 * MUST be called BEFORE the removal mutation — the nodes are gone afterwards.
 */
function collectSubtree<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  name: string,
): readonly Route<Dependencies>[] {
  const prefix = `${name}.`;
  const subtree = collectFlatRoutes(
    store,
    (fullName) => fullName === name || fullName.startsWith(prefix),
  );

  return Object.freeze([...subtree.values()]);
}

/**
 * Builds the FLAT, frozen payload array for an `add`, walking only the input
 * routes — O(added), not O(tree). `path` is taken from the input verbatim
 * (`sanitizeRoute` never rewrites it); config fields are read from the
 * post-commit store by full name. `add` never removes, so the input subtree is
 * exactly what changed.
 */
function collectAddedRoutes<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  routes: readonly Route<Dependencies>[],
  parentName: string | undefined,
  store: RoutesStore<Dependencies>,
): readonly Route<Dependencies>[] {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
  const factories = store.lifecycleNamespace!.getFactories();
  const result: Route<Dependencies>[] = [];

  const walk = (
    input: readonly Route<Dependencies>[],
    parent: string,
  ): void => {
    for (const route of input) {
      const fullName = parent ? `${parent}.${route.name}` : route.name;

      result.push(
        buildFlatRoute(fullName, route.path, store.config, factories),
      );

      if (route.children) {
        walk(route.children, fullName);
      }
    }
  };

  walk(routes, parentName ?? "");

  return Object.freeze(result);
}

/** Diffs two flat route maps by full name into frozen removed/added arrays. */
function diffFlatRoutes<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  before: ReadonlyMap<string, Route<Dependencies>>,
  after: ReadonlyMap<string, Route<Dependencies>>,
): {
  removed: readonly Route<Dependencies>[];
  added: readonly Route<Dependencies>[];
} {
  const removed: Route<Dependencies>[] = [];
  const added: Route<Dependencies>[] = [];

  for (const [fullName, route] of before) {
    if (!after.has(fullName)) {
      removed.push(route);
    }
  }

  for (const [fullName, route] of after) {
    if (!before.has(fullName)) {
      added.push(route);
    }
  }

  return { removed: Object.freeze(removed), added: Object.freeze(added) };
}

/**
 * Builds the structural subset of an `update()` patch (forwardTo /
 * defaultParams / encodeParams / decodeParams) from the already-destructured
 * update fields — so user getters are not re-invoked. A guard-only patch yields
 * an empty object → the caller emits no TREE_CHANGED (О-7: guards are
 * invoked-on-demand, not cached, so they need no observation channel).
 *
 * The returned envelope is a fresh object (caller's patch untouched) and is
 * frozen on construction. Nested values (e.g. `defaultParams`) are kept by
 * reference — the same objects the router stored — so exotic inputs (circular
 * refs, class instances) are tolerated, matching `update()`'s existing contract.
 */
function buildStructuralPatch<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(fields: {
  forwardTo?: string | ForwardToCallback<Dependencies> | null | undefined;
  defaultParams?: Params | null | undefined;
  decodeParams?: ((params: Params) => Params) | null | undefined;
  encodeParams?: ((params: Params) => Params) | null | undefined;
}): Readonly<TreeStructuralPatch<Dependencies>> {
  const patch: TreeStructuralPatch<Dependencies> = {};

  if (fields.forwardTo !== undefined) {
    patch.forwardTo = fields.forwardTo;
  }

  if (fields.defaultParams !== undefined) {
    patch.defaultParams = fields.defaultParams;
  }

  if (fields.encodeParams !== undefined) {
    patch.encodeParams = fields.encodeParams;
  }

  if (fields.decodeParams !== undefined) {
    patch.decodeParams = fields.decodeParams;
  }

  return Object.freeze(patch);
}

// ============================================================================
// CRUD operations
// ============================================================================

/**
 * Adds one or more routes to the router.
 * Input already validated by facade.
 */
function addRoutes<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  routes: Route<Dependencies>[],
  parentName?: string,
): void {
  // Prepare-then-commit (issue #698): reject the silent-corruption cases
  // up front (dup name vs existing, missing parent), build the merged tree /
  // config into locals (async/circular forwardTo + invalid constraint throw
  // here), then swap atomically. A rejected add leaves the store untouched.
  assertAddable(store, routes, parentName);

  const artifacts = buildAddArtifacts(store, routes, parentName);

  // Pre-flight the #961 handler-limit into PREPARE so a limit-exceeding batch
  // aborts before the swap (#1046). `add` does not clear guards, so the
  // projection runs against the live union count (clearsDefinition = false).
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
  store.lifecycleNamespace!.preflightHandlerLimit(
    artifacts.pendingCanActivate.keys(),
    artifacts.pendingCanDeactivate.keys(),
    false,
  );

  adoptRouteArtifacts(store, artifacts);
}

/**
 * Atomically replaces all routes with a new set (HMR / code-splitting).
 * Prepare-then-commit (issue #698): the new set is fully built into locals
 * first — a circular/async forwardTo or invalid path throws here, leaving the
 * existing tree intact — then committed.
 */
function replaceRoutes<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  routes: Route<Dependencies>[],
  ctx: RouterInternals<Dependencies>,
  currentState: State | undefined,
  onCommitted?: () => void,
): void {
  // Reject within-batch duplicate names BEFORE building/swapping (#968) — the
  // same silent-shadow case `assertAddable` catches for `add`. methodName is
  // "addRoute" to match validation-plugin (which reports "addRoute" for replace
  // batches too), so the no-plugin error is identical to the with-plugin one.
  assertNoDuplicateNamesInBatch(routes, "", "addRoute");

  // Build the whole new set BEFORE touching the store.
  const artifacts = buildReplaceArtifacts(
    routes,
    store.rootPath,
    store.matcherOptions,
  );

  // Pre-flight the #961 handler-limit BEFORE clearDefinitionGuards mutates, so a
  // limit-exceeding batch aborts with BOTH the tree and the definition guards
  // intact (#1046). replace clears definition guards first, so the projection
  // runs against the surviving external guards (clearsDefinition = true).
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
  store.lifecycleNamespace!.preflightHandlerLimit(
    artifacts.pendingCanActivate.keys(),
    artifacts.pendingCanDeactivate.keys(),
    true,
  );

  // Clear definition lifecycle handlers (preserve external guards), then swap.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
  store.lifecycleNamespace!.clearDefinitionGuards();
  adoptRouteArtifacts(store, artifacts);

  // TREE_CHANGED fires here (О-5): the new tree is committed but state is not
  // yet revalidated, so the handler sees the new tree and the still-old state.
  onCommitted?.();

  // Revalidate the active state against the new tree AND notify subscribers
  // (#950). A structural replace can change or drop the currently-active state;
  // emitting TRANSITION_SUCCESS makes router.subscribe / useSyncExternalStore
  // adapters re-render instead of rendering the pre-replace state. (This is the
  // one structural mutation that emits a transition event — clear() stays a
  // silent reset; the asymmetry is deliberate, see #950.)
  if (currentState !== undefined) {
    const revalidated = ctx.matchPath(currentState.path, ctx.getOptions());

    if (revalidated) {
      // Path still matches — commit the revalidated state (preserving the prior
      // transition meta) and emit so subscribers see it.
      const nextState: State = {
        ...revalidated,
        transition: currentState.transition,
      };

      ctx.setState(nextState);
      ctx.emitTransitionSuccess(nextState, currentState, REVALIDATE_OPTS);
    } else {
      // The active route no longer exists in the new tree — surface it as
      // not-found (commits UNKNOWN_ROUTE + emits TRANSITION_SUCCESS) so the
      // change is observable, rather than silently clearing the state.
      ctx.navigateToNotFound(currentState.path);
    }
  }
}

/**
 * Removes a route and all its children.
 *
 * @returns true if removed, false if not found
 */
function removeRoute<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(store: RoutesStore<Dependencies>, name: string): boolean {
  const wasRemoved = removeFromDefinitions(store.definitions, name);

  if (!wasRemoved) {
    return false;
  }

  clearRouteConfigurations(
    name,
    store.config,
    store.routeCustomFields,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    store.lifecycleNamespace!,
  );

  commitTreeChanges(store);

  return true;
}

/**
 * COMMIT step for the scalar config fields of an update (#951): writes
 * `defaultParams` / `decodeParams` / `encodeParams` in place. These assignments
 * are pure and never throw, so they run in the COMMIT phase after every throwing
 * field has been validated in PREPARE. `forwardTo` is handled separately — it
 * has its own throwing prepare step ({@link prepareForwardTo}).
 */
function commitScalarConfig<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  name: string,
  updates: {
    defaultParams?: Params | null | undefined;
    decodeParams?: ((params: Params) => Params) | null | undefined;
    encodeParams?: ((params: Params) => Params) | null | undefined;
  },
): void {
  if (updates.defaultParams !== undefined) {
    if (updates.defaultParams === null) {
      delete store.config.defaultParams[name];
    } else {
      store.config.defaultParams[name] = updates.defaultParams;
    }
  }

  if (updates.decodeParams !== undefined) {
    if (updates.decodeParams === null) {
      delete store.config.decoders[name];
    } else {
      const decoder = updates.decodeParams;

      store.config.decoders[name] = (params: Params): Params =>
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime fallback if user-provided decoder violates its return type
        decoder(params) ?? params;
    }
  }

  if (updates.encodeParams !== undefined) {
    if (updates.encodeParams === null) {
      delete store.config.encoders[name];
    } else {
      const encoder = updates.encodeParams;

      store.config.encoders[name] = (params: Params): Params =>
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime fallback if user-provided encoder violates its return type
        encoder(params) ?? params;
    }
  }
}

/**
 * COMMIT step for one guard field of an update (#951). `undefined` is a no-op;
 * `null` clears the DEFINITION-origin guard only, preserving an external guard
 * (#952); a factory installs together with its PREPARE-phase `precompiledFn`
 * (no re-compile — #956 seam). Extracted from `update()` so its prepare/commit
 * orchestration stays within the cognitive-complexity budget.
 */
function commitGuardUpdate<Dependencies extends DefaultDependencies>(
  lifecycle: RouteLifecycleNamespace<Dependencies>,
  kind: "activate" | "deactivate",
  name: string,
  value: GuardFnFactory<Dependencies> | null | undefined,
  precompiledFn: GuardFn | undefined,
): void {
  if (value === undefined) {
    return;
  }

  if (kind === "activate") {
    if (value === null) {
      lifecycle.clearCanActivate(name, true);
    } else {
      lifecycle.addCanActivate(name, value, true, precompiledFn);
    }
  } else if (value === null) {
    lifecycle.clearCanDeactivate(name, true);
  } else {
    lifecycle.addCanDeactivate(name, value, true, precompiledFn);
  }
}

/**
 * PREPARE step for a route's plugin-defined **custom fields** (#951) — the
 * `update` counterpart to how `add`/`replace` register them
 * (`registerSingleRouteHandlers`). A custom field is any patch key not in
 * {@link STANDARD_ROUTE_KEYS}.
 *
 * Computes the merged record and RETURNS it for the caller to commit;
 * `undefined` means no custom-field key was present, so the caller leaves the
 * store untouched. Semantics mirror the scalar fields in
 * {@link commitScalarConfig}: shallow-merge by patch key, `null` removes a
 * single field, `undefined` is a no-op (leaves the field untouched). When the
 * merge empties the record, the caller drops the whole entry so `getRouteConfig`
 * returns `undefined` — symmetric with `add`, which only stores a record when at
 * least one custom field exists.
 *
 * Reading the custom-field getters HERE (in PREPARE, not at commit) is what lets
 * a throwing getter abort the whole update before any field is written. The
 * merged record is a **fresh object**, never mutated in place: `cloneRouter`
 * shares per-route custom-field records by reference (`Object.assign`), so
 * replacing the reference keeps a clone isolated from post-clone updates on the
 * source.
 */
function prepareCustomFields<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  name: string,
  updates: RouteConfigUpdate<Dependencies>,
): Record<string, unknown> | undefined {
  let next: Record<string, unknown> | undefined;

  // `Object.keys` (not `Object.entries`): a value is read only AFTER the
  // standard-key guard, so structural-field getters — already read once by
  // `update`'s destructuring — are not re-invoked. `Object.entries` would read
  // every value eagerly, double-invoking a `defaultParams`/`forwardTo` getter
  // and breaking the "user getter called once" invariant.
  // eslint-disable-next-line unicorn/prefer-object-iterable-methods -- see above
  for (const key of Object.keys(updates)) {
    if (STANDARD_ROUTE_KEYS.has(key)) {
      continue;
    }

    const value = (updates as Record<string, unknown>)[key];

    // `undefined` mirrors the structural path: leave the field untouched.
    if (value === undefined) {
      continue;
    }

    // Clone-on-first-write — keeps clones (which alias this record) isolated.
    next ??= { ...store.routeCustomFields[name] };

    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }

  return next;
}

/**
 * Gets a route by name with all its configuration.
 */
function getRoute<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  name: string,
): Route<Dependencies> | undefined {
  const segments = store.matcher.getSegmentsByName(name);

  if (!segments) {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- segments is non-empty (checked above)
  const targetNode = segments.at(-1)! as RouteTree;
  const definition = nodeToDefinition(targetNode);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const factories = store.lifecycleNamespace!.getFactories();

  return enrichRoute(definition, name, store.config, factories);
}

// ============================================================================
// API factory
// ============================================================================

// Cache the assembled RoutesApi per router — mirrors getPluginApi()/getNavigator():
// avoids re-allocating the 9-closure bag on each call (adapters/plugins poll it
// from constructors) and gives spy/stub helpers a stable object identity. Closures
// capture `ctx`/`store`, both stable for the router's lifetime, so caching is safe.
// Single cast site: the value is stored as `unknown` (RoutesApi is invariant in
// Dependencies, so one typed map can't hold every instantiation) and cast on read.
const cache = new WeakMap<object, unknown>();

export function getRoutesApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): RoutesApi<Dependencies> {
  const cached = cache.get(router);

  if (cached) {
    return cached as RoutesApi<Dependencies>;
  }

  const ctx = getInternals(router);

  const store = ctx.routeGetStore();

  // Single cast site: the channel is typed with default Dependencies on
  // RouterInternals (RouterEventMap is non-generic), but payloads are built
  // with this api's Dependencies. The runtime shape is identical.
  const emitChange = (event: TreeChangedEvent<Dependencies>): void => {
    ctx.treeChanged.emit(event as TreeChangedEvent);
  };

  const api: RoutesApi<Dependencies> = {
    add: (routes, options) => {
      throwIfDisposed(ctx.isDisposed);
      throwIfReentrantTreeMutation(ctx.treeChanged.isEmitting);

      const routeArray = Array.isArray(routes) ? routes : [routes];
      const parentName = options?.parent;

      guardRouteStructure(routeArray, ctx.validator);

      if (parentName !== undefined) {
        ctx.validator?.routes.validateParentOption(parentName, store.tree);
      }

      ctx.validator?.routes.throwIfInternalRouteInArray(routeArray, "addRoute");
      ctx.validator?.routes.validateAddRouteArgs(routeArray);
      ctx.validator?.routes.validateRoutes(routeArray, store);

      addRoutes(store, routeArray, parentName);

      // Built from the post-commit store (О-1), only when someone is listening.
      if (ctx.treeChanged.listenerCount() > 0) {
        const added = collectAddedRoutes(routeArray, parentName, store);

        emitChange(
          parentName === undefined
            ? { op: "add", added }
            : { op: "add", added, parent: parentName },
        );
      }
    },

    remove: (name) => {
      throwIfDisposed(ctx.isDisposed);
      throwIfReentrantTreeMutation(ctx.treeChanged.isEmitting);

      ctx.validator?.routes.validateRemoveRouteArgs(name);
      ctx.validator?.routes.throwIfInternalRoute(name, "removeRoute");

      const canRemove = validateRemoveRoute(
        name,
        ctx.getStateName(),
        ctx.isTransitioning(),
      );

      if (!canRemove) {
        return;
      }

      // Snapshot the subtree BEFORE the mutation — the nodes are gone after.
      const removedSubtree =
        ctx.treeChanged.listenerCount() > 0
          ? collectSubtree(store, name)
          : undefined;
      const wasRemoved = removeRoute(store, name);

      if (!wasRemoved) {
        logger.warn(
          "router.removeRoute",
          `Route "${name}" not found. No changes made.`,
        );

        return;
      }

      if (removedSubtree !== undefined) {
        emitChange({ op: "remove", name, removedSubtree });
      }
    },

    update: (name, updates) => {
      throwIfDisposed(ctx.isDisposed);
      throwIfReentrantTreeMutation(ctx.treeChanged.isEmitting);

      ctx.validator?.routes.validateUpdateRouteBasicArgs(name, updates);
      ctx.validator?.routes.throwIfInternalRoute(name, "updateRoute");

      const {
        forwardTo,
        defaultParams,
        decodeParams,
        encodeParams,
        canActivate,
        canDeactivate,
      } = updates;

      ctx.validator?.routes.validateUpdateRoutePropertyTypes(name, updates);

      /* v8 ignore next 6 -- @preserve: race condition guard, mirrors Router.updateRoute() same-path guard tested via Router.ts unit tests */
      if (ctx.isTransitioning()) {
        logger.error(
          "router.updateRoute",
          `Updating route "${name}" while navigation is in progress. This may cause unexpected behavior.`,
        );
      }

      ctx.validator?.routes.validateUpdateRoute(name, updates, store);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
      const lifecycle = store.lifecycleNamespace!;

      // ===== PREPARE — compute every change into LOCALS. Any throw here aborts
      // update() before a single store write, so the whole field set is applied
      // all-or-nothing (#951): an async/cyclic forwardTo (#967), a guard factory
      // that throws on compile, or a throwing custom-field getter all leave the
      // route's prior config fully intact.
      const forwardToPlan =
        forwardTo === undefined
          ? undefined
          : prepareForwardTo(name, forwardTo, store.config);

      const nextCustomFields = prepareCustomFields(store, name, updates);

      // Guard factories are compiled NOW (a throwing factory surfaces in
      // PREPARE); the precompiled function is installed in COMMIT without
      // re-invoking the factory, so a factory side effect runs exactly once
      // (reuses the #956 compile-then-install seam). Compiled after the other
      // prepares so a throw upstream skips invoking the factory at all.
      const activateFn =
        canActivate === undefined || canActivate === null
          ? undefined
          : lifecycle.compileGuardFactory(canActivate, "canActivate");
      const deactivateFn =
        canDeactivate === undefined || canDeactivate === null
          ? undefined
          : lifecycle.compileGuardFactory(canDeactivate, "canDeactivate");

      // Pre-flight the #961 handler-limit before the COMMIT writes, so an
      // at-limit update that adds a NEW guard slot aborts before forwardTo /
      // scalar config land (#1046, #951). A slot is new only when `name` does
      // not already hold a guard of that type — an overwrite does not count.
      lifecycle.preflightHandlerLimit(
        activateFn === undefined ? [] : [name],
        deactivateFn === undefined ? [] : [name],
        false,
      );

      // ===== COMMIT — pure writes from here; nothing below throws.
      // Custom (plugin-defined) fields. Consumers read these lazily via
      // getRouteConfig (lifecycle hooks, preload, searchSchema), so no
      // TREE_CHANGED is needed — the next read sees the new value; the emit below
      // stays structural-only by design (О-7).
      if (nextCustomFields !== undefined) {
        if (Object.keys(nextCustomFields).length > 0) {
          store.routeCustomFields[name] = nextCustomFields;
        } else {
          delete store.routeCustomFields[name];
        }
      }

      if (forwardToPlan !== undefined) {
        store.config.forwardMap = forwardToPlan.forwardMap;
        store.config.forwardFnMap = forwardToPlan.forwardFnMap;
        store.resolvedForwardMap = forwardToPlan.resolved;
      }

      commitScalarConfig(store, name, {
        defaultParams,
        decodeParams,
        encodeParams,
      });

      // Install the guards from their PREPARE-phase precompiled functions; a
      // `null` clears the definition-origin guard only (#952). See
      // commitGuardUpdate.
      commitGuardUpdate(lifecycle, "activate", name, canActivate, activateFn);
      commitGuardUpdate(
        lifecycle,
        "deactivate",
        name,
        canDeactivate,
        deactivateFn,
      );

      // Conditional emit: structural fields only, built from the destructured
      // locals (so user getters are not re-invoked). A guard-only or empty
      // patch produces no event (О-7 + empty-patch rule).
      if (ctx.treeChanged.listenerCount() > 0) {
        const patch = buildStructuralPatch<Dependencies>({
          forwardTo,
          defaultParams,
          encodeParams,
          decodeParams,
        });

        if (Object.keys(patch).length > 0) {
          emitChange({ op: "update", name, patch });
        }
      }
    },

    clear: () => {
      throwIfDisposed(ctx.isDisposed);
      throwIfReentrantTreeMutation(ctx.treeChanged.isEmitting);

      const canClear = validateClearRoutes(ctx.isTransitioning());

      /* v8 ignore next 3 -- @preserve: race condition guard, mirrors Router.clearRoutes() same-path guard tested via validateClearRoutes unit tests */
      if (!canClear) {
        return;
      }

      // Snapshot the routes BEFORE the reset empties them. Emitted whenever
      // there is a listener — even for an empty clear (О-4).
      const removed =
        ctx.treeChanged.listenerCount() > 0
          ? Object.freeze([...collectFlatRoutes(store, () => true).values()])
          : undefined;

      resetStore(store);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
      store.lifecycleNamespace!.clearAll();
      ctx.clearState();

      if (removed !== undefined) {
        emitChange({ op: "clear", removed });
      }
    },

    has: (name) => {
      ctx.validator?.routes.validateRouteName(name, "hasRoute");

      return store.matcher.hasRoute(name);
    },

    get: (name) => {
      ctx.validator?.routes.validateRouteName(name, "getRoute");

      return getRoute(store, name);
    },

    replace: (routes) => {
      throwIfDisposed(ctx.isDisposed);
      throwIfReentrantTreeMutation(ctx.treeChanged.isEmitting);

      const routeArray = Array.isArray(routes) ? routes : [routes];

      const canReplace = validateClearRoutes(ctx.isTransitioning());

      if (!canReplace) {
        return;
      }

      guardRouteStructure(routeArray, ctx.validator);

      ctx.validator?.routes.throwIfInternalRouteInArray(
        routeArray,
        "replaceRoutes",
      );
      ctx.validator?.routes.validateAddRouteArgs(routeArray);
      ctx.validator?.routes.validateRoutes(routeArray, store);

      const currentState = router.getState();

      // The flat removed/added diff is O(N) — compute it only when someone is
      // listening (Решение 3.B). Snapshot the old tree BEFORE the swap.
      const before =
        ctx.treeChanged.listenerCount() > 0
          ? collectFlatRoutes(store, () => true)
          : undefined;

      replaceRoutes(
        store,
        routeArray,
        ctx,
        currentState,
        before === undefined
          ? undefined
          : () => {
              const after = collectFlatRoutes(store, () => true);
              const { removed, added } = diffFlatRoutes(before, after);

              emitChange({ op: "replace", removed, added });
            },
      );
    },

    subscribeChanges: (handler) => ctx.treeChanged.subscribe(handler),
  };

  cache.set(router, api);

  return api;
}
