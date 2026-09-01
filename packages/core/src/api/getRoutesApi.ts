import { nodeToDefinition } from "../engine";
import { throwIfDisposed, throwIfReentrantTreeMutation } from "./helpers";
import { errorCodes } from "../constants";
import { guardRouteStructure } from "../guards";
import { getInternals } from "../internals";
import {
  assertRouteDefaultChannelsFor,
  clearConfigEntries,
  spliceSubtree,
} from "../namespaces/RoutesNamespace/helpers";
import {
  validateClearRoutes,
  validateRemoveRoute,
  warnRemovalDuringNavigation,
} from "../namespaces/RoutesNamespace/routeGuards";
import {
  adoptRouteArtifacts,
  assertAddable,
  assertNoDuplicateNamesInBatch,
  assertNoDuplicatePathsInBatch,
  assertNoDottedNamesInBatch,
  assertNonEmptyNamesInBatch,
  assertNoInternalNamesInBatch,
  snapshotRouteBatch,
  assertNoInternalRouteName,
  buildAddArtifacts,
  buildReplaceArtifacts,
  commitRouteUpdate,
  commitTreeChanges,
  compileArtifactGuards,
  resetStore,
} from "../namespaces/RoutesNamespace/routesStore";
import { RouterError, freezeThrownError } from "../RouterError";
import { getTransitionPath } from "../transitionPath";

import type { RoutesApi } from "./types";
import type { RouteDefinition, RouteTree } from "../engine";
import type { RouterInternals } from "../internals";
import type { RouteLifecycleNamespace, RouteConfig } from "../namespaces";
import type { RoutesStore } from "../namespaces/RoutesNamespace";
import type {
  DefaultDependencies,
  ForwardToCallback,
  NavigationOptions,
  Params,
  ParamsSearch,
  SearchParams,
  Router,
  RouterLogger,
  State,
  TreeChangedEvent,
  TreeStructuralPatch,
  GuardFnFactory,
  Route,
} from "../types";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectKeys = Object.keys;

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

/** `removeRoute`'s "removed, but nobody is listening" payload. */
const EMPTY_SUBTREE: readonly never[] = Object.freeze([]);

/**
 * Clears all config entries and lifecycle handlers for exactly the routes the
 * removal took out of the tree — `removedNames` is the splice's own report, not
 * a name-prefix guess (#1757).
 */
function clearRouteConfigurations<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  removedNames: ReadonlySet<string>,
  config: RouteConfig,
  routeCustomFields: Record<string, Record<string, unknown>>,
  lifecycleNamespace: RouteLifecycleNamespace<Dependencies>,
): void {
  // ⚑ The set comes from the SPLICE (`spliceSubtree`), not from the name string
  // (#1757). `name === routeName || name.startsWith(routeName + ".")` asks a
  // strictly wider question: a flat dotted leaf `x.y` declared BESIDE `x` is a
  // standalone node the splice never touches, and the prefix claims it anyway.
  // The route then stays in the tree with its config and its guards
  // unregistered — a FAIL-OPEN, since a blocking `canActivate` simply
  // disappears and the route becomes freely activatable, with no log.
  const shouldClear = (name: string): boolean => removedNames.has(name);

  clearConfigEntries(config.decoders, shouldClear);
  clearConfigEntries(config.encoders, shouldClear);
  clearConfigEntries(config.defaultParams, shouldClear);
  clearConfigEntries(config.defaultSearch, shouldClear);
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

  for (const name of objectKeys(canActivateFactories)) {
    if (shouldClear(name)) {
      // Route removed from the tree — both origin slots go (route no longer exists).
      lifecycleNamespace.clearCanActivate(name, "both");
    }
  }

  for (const name of objectKeys(canDeactivateFactories)) {
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

  if (lookupName in config.defaultSearch) {
    route.defaultSearch = config.defaultSearch[lookupName];
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
 * Collects the routes named by `removedNames` as a FLAT, frozen array — the
 * `TREE_CHANGED` payload for a removal.
 *
 * MUST be called AFTER the definitions splice (so the set is known) and BEFORE
 * `clearRouteConfigurations` + `commitTreeChanges` (so the store still carries
 * the config and the tree the payload is built from).
 *
 * ⚑ Driven by the splice's own set rather than by the name prefix (#1757): the
 * prefix form named a flat dotted namesake that `has()` still answers `true`
 * for, i.e. it announced the removal of a live route — the lying-event shape of
 * #1194 manifestation (1), reached through `remove`.
 */
function collectSubtree<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  removedNames: ReadonlySet<string>,
): readonly Route<Dependencies>[] {
  const subtree = collectFlatRoutes(store, (fullName) =>
    removedNames.has(fullName),
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
  defaultSearch?: SearchParams | null | undefined;
  decodeParams?: ((channels: ParamsSearch) => ParamsSearch) | null | undefined;
  encodeParams?: ((channels: ParamsSearch) => ParamsSearch) | null | undefined;
}): Readonly<TreeStructuralPatch<Dependencies>> {
  const patch: TreeStructuralPatch<Dependencies> = {};

  if (fields.forwardTo !== undefined) {
    patch.forwardTo = fields.forwardTo;
  }

  if (fields.defaultParams !== undefined) {
    patch.defaultParams = fields.defaultParams;
  }

  if (fields.defaultSearch !== undefined) {
    patch.defaultSearch = fields.defaultSearch;
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
): readonly Route<Dependencies>[] {
  // One read per own key (#1899) — so the name the
  // guards validate is the name the tree registers.
  //
  // ⚑ RETURNED, because the `TREE_CHANGED` payload has to be built from it too
  // (#1931). Walking the caller's array again for the payload re-read `name`,
  // `path` and `children` AFTER `adoptRouteArtifacts` had run application code,
  // so the event could announce a route `has()` denies while omitting the one
  // the tree took. The snapshot already existed here and was thrown away.
  const batch = snapshotRouteBatch(routes);

  // Prepare-then-commit (issue #698): reject the silent-corruption cases
  // up front (dup name vs existing, missing parent), build the merged tree /
  // config into locals (async/circular forwardTo + invalid constraint throw
  // here), then swap atomically. A rejected add leaves the store untouched.
  assertAddable(store, batch, parentName);

  const artifacts = buildAddArtifacts(store, batch, parentName, logger);

  // Config-time channel check on the PREPARED artifacts, in PREPARE — the same
  // position `replace` gives it, and for the same reason (a throw must precede
  // every mutation, not merely the swap).
  assertRouteDefaultChannelsFor(
    artifacts.matcher,
    artifacts.config,
    "addRoute",
  );

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

  return batch;
}

/**
 * The route the LIVE tree matches `path` to, or `undefined` when nothing does.
 *
 * Deliberately the RAW matcher rather than `ctx.matchPath`: this asks who the
 * URL belongs to, and it must run no application code — `matchPath` layers the
 * route's `decodeParams`, the `forwardState` seam (dynamic `forwardTo`
 * callbacks and plugin interceptors) and the encoders on top, so asking it here
 * would re-open the very window the caller is guarding. A consequence worth
 * naming: the raw matcher is forward-BLIND, so installing a `forwardTo` changes
 * who the url resolves to without changing who it matches.
 */
function urlOwner<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(store: RoutesStore<Dependencies>, path: string): string | undefined {
  return store.matcher.match(path)?.segments.at(-1)?.fullName;
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
  store: RoutesStore<Dependencies>,
  ctx: RouterInternals<Dependencies>,
  nextState: State,
  fromState: State,
  ownerBefore: string | undefined,
): void {
  // The THIRD commit door, and the one that shipped without the question the
  // other two ask (#1753): `completeTransition` and `navigateToState` both
  // refuse a state whose route no longer exists, and this path refused nothing
  // — `systemCommit` below asks whether the MACHINE may commit, which is a
  // different question and deliberately so. ⚠ Not "is the router alive": that
  // was #1186's predicate, and #1644 replaced it with `canSend(SYSTEM_COMMIT)`,
  // an edge declared on `READY` alone — so it refuses a perfectly LIVE router
  // that is merely starting or mid-transition (`routerFSM.ts:686-688`).
  //
  // The window is real on BOTH arms, because both run application code between
  // `matchPath` and here: the survivor arm through the route's own
  // `decodeParams` (invoked by that `matchPath`), the route-identity arm
  // additionally through the activation guards it consults (#1201). Either can
  // reach back into route-CRUD — `isTransitioning()` is false and the
  // `TREE_CHANGED` dispatch has already returned, so nothing else stops them —
  // and the measured shapes were a guard removing the very route it was
  // consulted about, and a NESTED `replace()` from a decoder dropping the route
  // the outer call was about to re-commit (whose own revalidation committed
  // first, so the outer commit then OVERWROTE it with a phantom).
  //
  // `store.matcher` is re-read here rather than captured: a nested `replace()`
  // swaps the field, so the late read is what sees the tree as it stands at the
  // commit. The fall-through is the arm this function's callers already use for
  // "the URL no longer belongs to a route we can commit".
  //
  // ⚑ The question is whether the URL's owner MOVED while the window ran
  // (#1754), and both halves of that sentence are load-bearing.
  //
  // OWNERSHIP rather than existence, because `hasRoute(name)` — what
  // #1753 shipped, and what the other two doors ask — closes "the route is
  // gone" and nothing else, and the NAME is the one field of `nextState` that
  // the window can leave untouched while invalidating everything around it: a
  // nested `replace()` reusing the name at another path, a `setRootPath` (every
  // name survives, every path moves), an `add` of a more specific route, an
  // `update` installing a `forwardTo`. All four were measured committing a
  // state whose own `path` the live tree no longer routes to its `name` —
  // `buildPath(name)` and `state.path` disagreeing, `matchPath(state.path)`
  // answering `undefined` or a different route.
  //
  // Asking the raw matcher instead answers that directly, and it SUBSUMES the
  // existence check: a name the matcher hands back is a name the matcher holds,
  // so a stable owner implies the route still exists. That is why this replaces
  // the `hasRoute` call rather than joining it — the existence branch would be
  // redundant, and in the ownership-first spelling it would be unreachable and
  // red the 100 % branch gate.
  //
  // ⚠ CHANGED rather than "still owns it", and that distinction is a measured
  // correction, not a refinement. The first version asked
  // `match(nextState.path) === nextState.name` — which silently assumes the
  // committed path BELONGS to the committed name. Two shapes break that
  // assumption before any window runs, and one of them is on DEFAULT options:
  // `rewritePathOnMatch: false` leaves `state.path` as the SOURCE url of a
  // `forwardTo` (`RoutesNamespace.matchPath`), and the #1157 catch does the same
  // when the target's rebuild throws for a missing required param. Both commit
  // `{ name: terminal, path: source }` deliberately and are pinned as such — so
  // an ownership EQUALITY test 404s them on every `replace()`, healthy or not.
  // Measured: an equality test lands both on `UNKNOWN_ROUTE` where they
  // should commit.
  //
  // Comparing the answer against the same question asked BEFORE the window
  // needs no such assumption. A state whose path never belonged to its name
  // keeps a stable answer and commits; a window that removes the route, moves
  // it, or lets another route take the URL changes the answer and is refused.
  // The snapshot is taken in `replaceRoutes` immediately before the revalidating
  // `matchPath`, because that call is itself the first window actor (it invokes
  // the route's `decodeParams`).
  //
  // Two properties make it affordable where re-running `matchPath` would not
  // be. It runs NO application code: the route's `decodeParams`, the
  // `forwardState` seam and the encoders all sit ABOVE it in
  // `RoutesNamespace.matchPath`, and the matcher's own decode/parse hooks are
  // derived from option FLAGS (`deriveMatcherOptions`), never from a caller's
  // function — so the predicate cannot re-open the very window it guards. And
  // it is asked once per `replace()` on a router that has state, a path with no
  // benchmark on it.
  //
  // ⚠ The equality form WAS measured before being trusted — instrumented over
  // the whole tier, 515 firings and 512 agreements — and the measurement was
  // still not enough, which is the lesson worth keeping: the tier's shapes are
  // not the reachable shapes. Every case it covered had a path rebuilt from the
  // resolved route, so the whole class where `state.path` is the SOURCE url was
  // invisible to it. The difference form does not depend on that class at all.
  const ownerNow = urlOwner(store, fromState.path);

  if (ownerNow !== ownerBefore) {
    ctx.revalidateToNotFound(fromState.path);

    return;
  }

  // Through the machine now (`SYSTEM_COMMIT`), so the write and the announce
  // are one table fact rather than two statements here. `replace()` USED TO run
  // application code between its entry `throwIfDisposed()` and this line —
  // `clearDefinitionGuards()` recompiled the compiled slot by invoking a
  // surviving EXTERNAL factory (#1192) — and a `dispose()` / `stop()` from
  // there let the swap finish and commit on a dead router with zero events
  // (#1627). #1649 removed THAT at the root: `clearDefinitionGuards`'s
  // re-derivation READS the survivor's stored compiled form instead of
  // re-running its factory.
  //
  // ⚠ It does NOT follow that `replace()` "executes nothing of the caller's
  // between the two points". It executes at LEAST four other things, all
  // above: the NEW batch's
  // guard factories (`compileArtifactGuards` → `compileFactory`, which is
  // `factory(router, getDependency)`), the `TREE_CHANGED` handlers, the route's
  // own `decodeParams` invoked by the revalidating `matchPath`, and the new
  // route's activation guards consulted since #1201. That sentence is what made
  // the missing existence check above look unnecessary (#1753) — a fix's scope
  // written up as the window's scope. ⚑ Written "at least four" on purpose: the
  // first draft of THIS correction said "two other things, both above" and
  // reproduced the very failure it names — an enumeration passed off as
  // exhaustive.
  //
  // ⚑ The liveness this line relies on is KEPT anyway, and deliberately: it now
  // covers a router disposed or stopped by some OTHER means between the entry
  // check and here, which `replace()` can no longer cause but cannot rule out.
  // The interim re-check that once did the job is gone — a dead router simply
  // has no edge to take, and `systemCommit` turns that silent refusal into the
  // throw the callers were already promised — `ROUTER_DISPOSED` after a
  // `dispose()`, `ROUTER_NOT_STARTED` after a `stop()`, since the machine is
  // then IDLE rather than DISPOSED (measured; #1644 split the two codes).
  ctx.systemCommit(nextState, fromState, REVALIDATE_OPTS);
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
  // One read per own key (#1899) — same reason as `add`.
  const batch = snapshotRouteBatch(routes);

  assertNoInternalNamesInBatch(batch, "addRoute");
  assertNonEmptyNamesInBatch(batch, "addRoute");
  assertNoDottedNamesInBatch(batch, "addRoute");
  assertNoDuplicateNamesInBatch(batch, "", "addRoute");
  assertNoDuplicatePathsInBatch(batch, "", "addRoute");

  // Build the whole new set BEFORE touching the store.
  const artifacts = buildReplaceArtifacts(
    batch,
    store.rootPath,
    store.matcherOptions,
    ctx.logger,
  );

  // Config-time channel check BEFORE clearDefinitionGuards mutates. Inside
  // `adoptRouteArtifacts`, one line before the swap, is early enough for `add`
  // and too late here: a refused batch would leave the tree intact and the old
  // definition guards ERASED, so a guarded route becomes freely activatable.
  // Same fail-open shape #1046 and #1193 hoisted their own throws out of.
  assertRouteDefaultChannelsFor(
    artifacts.matcher,
    artifacts.config,
    "addRoute",
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
    // Who owns this URL BEFORE any of the revalidation's own application code
    // runs. The comparison at the door is against THIS, not against
    // `currentState.name` — see `commitRevalidated`. It has to be read here
    // rather than inside the door because the very next statement is the first
    // window actor: `matchPath` invokes the route's `decodeParams`.
    const ownerBefore = urlOwner(store, currentState.path);

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
        // ⚑ This object is never published: the commit door copies what it is
        // handed and commits its own (#1792), so nothing here freezes — and
        // nothing outside `commitRevalidated` ever holds it. The `context` line
        // still does its job: its CONTENTS are what survive the revalidation,
        // which is what #1236 is about. Its identity does not, so a plugin that
        // cached the context object itself across a `replace()` writes into an
        // object the router no longer holds.
        const nextState: State = {
          ...revalidated,
          context: currentState.context,
          transition: currentState.transition,
        };

        commitRevalidated(store, ctx, nextState, currentState, ownerBefore);
      } else {
        // Route-identity change — the URL is now owned by a DIFFERENT route (an
        // ownership reshuffle, or a newly-added `forwardTo` that teleports the
        // state). Consult the new route's ACTIVATION guards (#1201): commit on
        // pass; on a block — or an async guard that cannot be evaluated
        // synchronously (mirrors `canNavigateTo`) — route to not-found rather
        // than silently activating a guarded route.
        //
        // ⚠ ACTIVATION ONLY — the deactivate list is deliberately empty (#1652).
        // `canNavigateTo` collapses both halves into ONE boolean, and this arm
        // routes every `false` to not-found. That reading is right for "cannot
        // ENTER" and exactly backwards for "do not LEAVE": the guard exists to
        // keep the user where they are, and eviction to a 404 is the worst
        // outcome available. Measured before the fix: with no `canDeactivate`
        // the user landed on the new route, WITH a refusing one on
        // UNKNOWN_ROUTE — a guard that cannot be honoured was making the result
        // worse than no guard at all.
        //
        // Not asking is what the other two revalidation arms already do, each
        // with its reason written beside it (survivor: the user was legitimately
        // here, #1201; vanished: the route whose guard would speak is gone). So
        // this removes the odd one out rather than adding a mechanism: a tree
        // swap is an operation the APPLICATION performed, not a departure the
        // user chose, and `canDeactivate` has no "stay" branch to offer here —
        // after the swap the old route may not exist, or may live at another
        // path, so a retained state would point at a route that no longer owns
        // its URL. Checking for unsaved work before swapping the tree is the
        // caller's job; the router does not promise to veto its own API.
        //
        // Side effect worth naming: the refusal does NOT short-circuit ahead
        // of the activation guards, so "may the user be on the new route" is
        // always asked.
        const { toActivate } = getTransitionPath(
          revalidated,
          currentState,
          ctx.getMetaForState,
        );

        const allowed =
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
          store.lifecycleNamespace!.canNavigateTo(
            [],
            toActivate,
            revalidated,
            currentState,
          );

        if (allowed) {
          const nextState: State = {
            ...revalidated,
            transition: currentState.transition,
          };

          commitRevalidated(store, ctx, nextState, currentState, ownerBefore);
        } else {
          // The REVALIDATION door, and its reason CHANGED with #1652: it is no
          // longer "the question was already put above" (it no longer is) but
          // the same rule as the consult itself — revalidation does not consult
          // deactivate guards. Calling the departure door here would let the
          // fallback throw CANNOT_DEACTIVATE out of a route-CRUD call, which is
          // the shape #1643 deliberately kept for user-initiated departures
          // only. Since #1981 that is a different FUNCTION rather than a flag,
          // so the two cannot be confused at the call site.
          ctx.revalidateToNotFound(currentState.path);
        }
      }
    } else {
      // The active route no longer exists in the new tree — surface it as
      // not-found (commits UNKNOWN_ROUTE + emits TRANSITION_SUCCESS) so the
      // change is observable, rather than silently clearing the state.
      //
      // No deactivation consult (#1643): the route whose guard would be asked
      // is the one that just stopped existing. There is nothing to refuse on
      // behalf of, and a guard closure over a removed route is not a contract
      // this can honour.
      ctx.revalidateToNotFound(currentState.path);
    }
  }
}

/**
 * Removes a route and all its children.
 *
 * @returns the removed subtree when `wantSubtree` is set, an empty array when it
 * is not, and `undefined` when the name is not a route. Three outcomes, so a
 * caller distinguishing "removed" from "not found" must test for `undefined` —
 * an empty array is a successful removal.
 */
function removeRoute<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  name: string,
  wantSubtree: boolean,
): readonly Route<Dependencies>[] | undefined {
  // `store.definitions` is a fresh tree-derived snapshot — mutate it locally,
  // then commit the mutated table as the new tree.
  const definitions = store.definitions;
  const removedNames = spliceSubtree(definitions, name);

  if (removedNames === undefined) {
    return undefined;
  }

  // Between the splice and the two commits below: the store still holds the old
  // tree AND the config the payload reads, which is the only moment either is
  // available together with the set (#1757). Empty — not `undefined` — when
  // nobody is listening, so `undefined` means one thing only: not a route.
  const subtree = wantSubtree
    ? collectSubtree(store, removedNames)
    : EMPTY_SUBTREE;

  clearRouteConfigurations(
    removedNames,
    store.config,
    store.routeCustomFields,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    store.lifecycleNamespace!,
  );

  commitTreeChanges(store, definitions);

  return subtree;
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

      const batch = addRoutes(store, routeArray, parentName, ctx.logger);

      // Built from the post-commit store (О-1), only when someone is listening.
      //
      // ⚑ From the SNAPSHOT, never from `routeArray` (#1931): the caller's array
      // is application code's, and everything between the snapshot and this line
      // — guard factories compiled inside `adoptRouteArtifacts` among them — can
      // change what a second read of it answers.
      if (ctx.treeChanged.listenerCount() > 0) {
        const added = collectAddedRoutes(batch, parentName, store);

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
        ctx.logger,
      );

      if (!canRemove) {
        return;
      }

      const wantSubtree = ctx.treeChanged.listenerCount() > 0;
      // The payload is built INSIDE, between the splice and the commits — the
      // one moment the removed-name set, the old tree and the config coexist
      // (#1757). `undefined` means the name is not a route at all.
      const removedSubtree = removeRoute(store, name, wantSubtree);

      if (removedSubtree === undefined) {
        ctx.logger.warn(
          "router.removeRoute",
          `Route "${name}" not found. No changes made.`,
        );

        return;
      }

      // Below the existence check on purpose (#1756): everything this reports
      // is a consequence of a route leaving the tree, so it has no subject
      // until one has.
      if (ctx.isTransitioning()) {
        warnRemovalDuringNavigation(name, ctx.logger);
      }

      if (wantSubtree) {
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

      ctx.validator?.routes.validateUpdateRoute(name, updates, store);

      // #1205: bare-core existence backstop as a TRUE no-op — NOT a throw
      // (validation is opt-in). Without it, update() of a route that does not
      // exist seeds config.defaultParams + compiles/registers the guard
      // (commitRouteUpdate below) and emits a lying TREE_CHANGED "update" event
      // for a route get()/has() cannot see; a future add() of that name then
      // inherits the phantom config + a blocking guard. Skip the commit and the
      // emit entirely when the route is absent. (With the validation-plugin, validateUpdateRoute above
      // already threw a ReferenceError, so this is only reached in bare core.)
      if (!store.matcher.hasRoute(name)) {
        return;
      }

      // Below the existence check, for the same reason the removal report is
      // (#1756): it names an action, and `update("nope")` performs none. From
      // above it logged an ERROR announcing an update that never happened, and
      // — unlike `remove()`, which at least contradicts itself out loud one
      // line later — said nothing afterwards.
      if (ctx.isTransitioning()) {
        ctx.logger.error(
          "router.updateRoute",
          `Updating route "${name}" while navigation is in progress. This may cause unexpected behavior.`,
        );
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

        if (objectKeys(patch).length > 0) {
          emitChange({ op: "update", name, patch });
        }
      }
    },

    clear: () => {
      throwIfDisposed(ctx.isDisposed);
      throwIfReentrantTreeMutation(ctx.treeChanged.isEmitting);

      // `clear()` is a TEARDOWN primitive, and it may only run while there is
      // nothing to tear down out from under anyone (#1612). Dropping the
      // committed state to `undefined` silently leaves every `router.subscribe`
      // consumer rendering a route the router has discarded, and the router
      // `isActive() === true` with no state — a shape that
      // otherwise exists only *during* `start()`, which is why an always-on
      // guard misreads it (path-less `navigateToNotFound()` answers
      // ROUTER_NOT_STARTED on a started router).
      //
      // Announcing the reset instead was considered and rejected: it would make
      // CRUD emit a transition event as a RULE (`replace()` is deliberately "the
      // one structural mutation that emits" one) and it would not remove the
      // shape. Refusing removes the crossing entirely — `clear()` stops writing
      // into state it does not own. `replace(routes)` is the spelling for a
      // running router: atomic, notifies subscribers, and preserves external
      // guards. Design note `fsm-as-state-owner-2026-07-31.md` §11.A1, option
      // (в), owner decision 2026-08-01.
      //
      // A THROW rather than the `logger.error` + no-op that `validateClearRoutes`
      // uses below, because the two preconditions are different classes: "a
      // navigation is in flight" clears by itself (wait and retry works), while
      // this one never does — the caller has to change the code. That is the
      // same line `REENTRANT_TREE_MUTATION` sits on (#1032).
      if (ctx.getStateName() !== undefined) {
        throw freezeThrownError(
          new RouterError(errorCodes.ROUTER_NOT_STOPPED, {
            message:
              "[router.clear] Cannot clear routes while a state is committed. " +
              "Use replace(routes) to swap the tree on a running router, or stop() first.",
          }),
        );
      }

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

  // ⚑ FROZEN, and the freeze is what the cache above makes necessary (#1805).
  // One object per router is handed to every consumer — three plugins plus 100
  // call sites across the example apps — so a single `api.add = …` rewires the
  // surface for all of them, silently and with nothing for the next consumer to
  // notice. `getNavigator` next door has always frozen its cached bag and calls
  // itself "a frozen read-only subset"; the two uncached factories
  // (`getLifecycleApi`, `getDependenciesApi`) need nothing, because a write to a
  // per-call object cannot reach a second consumer.
  //
  // ⚠ Measured free: core, all six adapters and every plugin that reaches this
  // door stay green under the freeze. Its twin `getPluginApi` is NOT free — 20
  // tests in four packages spy on that shared surface to inject errors — which
  // is why this half ships alone.
  const frozen = Object.freeze(api);

  cache.set(router, frozen);

  return frozen;
}
