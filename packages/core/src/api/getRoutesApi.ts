import { nodeToDefinition } from "engine";

import { throwIfDisposed, throwIfReentrantTreeMutation } from "./helpers";
import { guardRouteStructure } from "../guards";
import { getInternals } from "../internals";
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
  assertNoDuplicateNamesInBatch,
  assertNoDuplicatePathsInBatch,
  assertNoInternalNamesInBatch,
  assertNoInternalRouteName,
  buildAddArtifacts,
  buildReplaceArtifacts,
  commitRouteUpdate,
  commitTreeChanges,
  compileArtifactGuards,
  resetStore,
} from "../namespaces/RoutesNamespace/routesStore";
import { getTransitionPath } from "../transitionPath";

import type { RoutesApi } from "./types";
import type { RouterInternals } from "../internals";
import type { RouteLifecycleNamespace, RouteConfig } from "../namespaces";
import type { RoutesStore } from "../namespaces/RoutesNamespace";
import type {
  DefaultDependencies,
  ForwardToCallback,
  NavigationOptions,
  Params,
  Router,
  RouterLogger,
  State,
  TreeChangedEvent,
  TreeStructuralPatch,
} from "../public-types";
import type { GuardFnFactory, Route } from "../types";
import type { RouteDefinition, RouteTree } from "engine";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Opts attached to the `TRANSITION_SUCCESS` emitted by `replace()` when it
 * revalidates the active state (#950). `replace` does not push history, so it
 * is a replace-type success — matching `navigateToNotFound`'s opts for the
 * dropped-route branch.
 */
const REVALIDATE_OPTS: NavigationOptions = Object.freeze({
  replace: true,
  revalidate: true,
});

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
      // Route removed from the tree — both origin slots go (route no longer exists).
      lifecycleNamespace.clearCanActivate(name, "both");
    }
  }

  for (const name of Object.keys(canDeactivateFactories)) {
    if (shouldClear(name)) {
      lifecycleNamespace.clearCanDeactivate(name, "both");
    }
  }
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
  parentName: string | undefined,
  logger: RouterLogger,
): void {
  // Prepare-then-commit (issue #698): reject the silent-corruption cases
  // up front (dup name vs existing, missing parent), build the merged tree /
  // config into locals (async/circular forwardTo + invalid constraint throw
  // here), then swap atomically. A rejected add leaves the store untouched.
  assertAddable(store, routes, parentName);

  const artifacts = buildAddArtifacts(store, routes, parentName, logger);

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
 * Commits a revalidated state after `replace()` and emits `TRANSITION_SUCCESS`
 * so `router.subscribe` / adapters re-render (#950). The emit carries
 * `REVALIDATE_OPTS` — the single distinguishable marker (`revalidate: true`) a
 * plugin's `onTransitionSuccess` can read to special-case a revalidation vs a
 * real navigation (#1201).
 */
function commitRevalidated<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  ctx: RouterInternals<Dependencies>,
  nextState: State,
  fromState: State,
): void {
  ctx.setState(nextState);
  ctx.emitTransitionSuccess(nextState, fromState, REVALIDATE_OPTS);
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
  // Reject the silent-corruption cases `assertAddable` catches for `add`, BEFORE
  // building/swapping, so bare-core parity is symmetric (#1047): within-batch
  // duplicate names (#968), reserved "@@" names (#954), and within-batch
  // duplicate paths (#955). methodName is "addRoute" to match validation-plugin
  // (which reports "addRoute" for replace batches too), so the no-plugin error
  // is identical to the with-plugin one.
  assertNoInternalNamesInBatch(routes, "addRoute");
  assertNoDuplicateNamesInBatch(routes, "", "addRoute");
  assertNoDuplicatePathsInBatch(routes, "", "addRoute");

  // Build the whole new set BEFORE touching the store.
  const artifacts = buildReplaceArtifacts(
    routes,
    store.rootPath,
    store.matcherOptions,
    ctx.logger,
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

  // Pre-compile the new batch's guard factories in the PREPARE phase — BEFORE
  // clearDefinitionGuards — so a compile-throwing factory (or a non-function)
  // aborts here with BOTH the tree AND the old definition guards intact (#1193,
  // mirror of the #1046 handler-limit hoist). adoptRouteArtifacts then installs
  // these pre-compiled functions without re-running the factories.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
  const compiledGuards = compileArtifactGuards(artifacts, store.depsStore!);

  // Clear definition lifecycle handlers (preserve external guards), then swap.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
  store.lifecycleNamespace!.clearDefinitionGuards();
  adoptRouteArtifacts(store, artifacts, compiledGuards);

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
      if (revalidated.name === currentState.name) {
        // Survivor — the URL still maps to the route the user was already on.
        // Keep it WITHOUT re-running guards: the user legitimately reached this
        // route via a real navigation, and `replace()` is not a navigation they
        // performed, so re-checking guards here would evict them on a stateful
        // or async guard (parity with `update()`, which never revalidates the
        // active state). Preserve the prior transition meta and emit so
        // subscribers see the revalidated state (#1201). Carry the prior
        // `context` (#1236): the route name and path are unchanged, so the
        // plugin data written into `state.context.<namespace>` (SSR data, rsc,
        // navigation, …) is still valid — the matchPath-rebuilt state would
        // otherwise wipe it, and revalidation re-runs neither the loader nor the
        // start interceptor to bring it back.
        const nextState: State = {
          ...revalidated,
          context: currentState.context,
          transition: currentState.transition,
        };

        commitRevalidated(ctx, nextState, currentState);
      } else {
        // Route-identity change — the URL is now owned by a DIFFERENT route (an
        // ownership reshuffle, or a newly-added `forwardTo` that teleports the
        // state). That is effectively a navigation the user never performed, so
        // consult the new route's guards exactly as `navigate` would (#1201).
        // Commit on pass; on a block — or an async guard that cannot be
        // evaluated synchronously (mirrors `canNavigateTo`) — route to
        // not-found rather than silently activating a guarded route.
        const { toDeactivate, toActivate } = getTransitionPath(
          revalidated,
          currentState,
        );

        const allowed =
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
          store.lifecycleNamespace!.canNavigateTo(
            toDeactivate,
            toActivate,
            revalidated,
            currentState,
          );

        if (allowed) {
          const nextState: State = {
            ...revalidated,
            transition: currentState.transition,
          };

          commitRevalidated(ctx, nextState, currentState);
        } else {
          ctx.navigateToNotFound(currentState.path);
        }
      }
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
  // `store.definitions` is a fresh tree-derived snapshot — mutate it locally,
  // then commit the mutated table as the new tree.
  const definitions = store.definitions;
  const wasRemoved = removeFromDefinitions(definitions, name);

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

  commitTreeChanges(store, definitions);

  return true;
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
      ctx.validator?.routes.validateRoutes(routeArray, store, parentName);

      addRoutes(store, routeArray, parentName, ctx.logger);

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
      // Always-on parity backstop (#1047 / #238): a reserved "@@" name is
      // internal and cannot be removed, with or without the validation-plugin.
      assertNoInternalRouteName(name, "removeRoute");

      const canRemove = validateRemoveRoute(
        name,
        ctx.getStateName(),
        ctx.isTransitioning(),
        ctx.logger,
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
        ctx.logger.warn(
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
      // Always-on parity backstop (#1047 / #238): a reserved "@@" name is
      // internal and cannot be updated, with or without the validation-plugin.
      assertNoInternalRouteName(name, "updateRoute");

      ctx.validator?.routes.validateUpdateRoutePropertyTypes(name, updates);

      /* v8 ignore next 6 -- @preserve: race condition guard, mirrors Router.updateRoute() same-path guard tested via Router.ts unit tests */
      if (ctx.isTransitioning()) {
        ctx.logger.error(
          "router.updateRoute",
          `Updating route "${name}" while navigation is in progress. This may cause unexpected behavior.`,
        );
      }

      ctx.validator?.routes.validateUpdateRoute(name, updates, store);

      // #1205: bare-core existence backstop as a TRUE no-op — NOT a throw
      // (validation is opt-in). update() of a route that does not exist used to
      // seed config.defaultParams + compile/register the guard (commitRouteUpdate
      // below) and emit a lying TREE_CHANGED "update" event for a route get()/
      // has() cannot see; a future add() of that name then inherited the phantom
      // config + a blocking guard. Skip the commit and the emit entirely when the
      // route is absent. (With the validation-plugin, validateUpdateRoute above
      // already threw a ReferenceError, so this is only reached in bare core.)
      if (!store.matcher.hasRoute(name)) {
        return;
      }

      // Field-patch commit core (NO_TREE_REBUILD) — co-located in routesStore.ts
      // beside the add/replace (adoptRouteArtifacts) / remove (commitTreeChanges)
      // / clear (resetStore) cores. Returns the structural fields for the
      // conditional emit below (each user getter read once inside).
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
      const lifecycle = store.lifecycleNamespace!;
      const structural = commitRouteUpdate(store, lifecycle, name, updates);

      // Conditional emit: structural fields only. A guard-only or empty patch
      // produces no event (О-7 + empty-patch rule).
      if (ctx.treeChanged.listenerCount() > 0) {
        const patch = buildStructuralPatch<Dependencies>(structural);

        if (Object.keys(patch).length > 0) {
          emitChange({ op: "update", name, patch });
        }
      }
    },

    clear: () => {
      throwIfDisposed(ctx.isDisposed);
      throwIfReentrantTreeMutation(ctx.treeChanged.isEmitting);

      const canClear = validateClearRoutes(ctx.isTransitioning(), ctx.logger);

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

      const canReplace = validateClearRoutes(ctx.isTransitioning(), ctx.logger);

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
