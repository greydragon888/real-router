// packages/core/src/namespaces/RoutesNamespace/routesStore.ts

import { logger } from "@real-router/logger";
import {
  createMatcher,
  createRouteTree,
  routeTreeToDefinitions,
} from "engine";

import { DEFAULT_ROUTE_NAME, STANDARD_ROUTE_KEYS } from "./constants";
import { resolveForwardChain } from "./forwardChain";
import {
  assignConfigEntries,
  createEmptyConfig,
  sanitizeRoute,
} from "./helpers";

import type { RouteConfig, RoutesDependencies } from "./types";
import type { GuardFnFactory, Route } from "../../types";
import type { RouteLifecycleNamespace } from "../RouteLifecycleNamespace";
import type {
  DefaultDependencies,
  ForwardToCallback,
  GuardFn,
  Params,
  RouteConfigUpdate,
} from "@real-router/types";
import type {
  CreateMatcherOptions,
  Matcher,
  RouteDefinition,
  RouteTree,
} from "engine";

// =============================================================================
// Interfaces
// =============================================================================

export interface RoutesStore<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  /**
   * DERIVED VIEW, not stored state: reconstructed from `tree` on every access
   * via `routeTreeToDefinitions` (the lossless inverse cloneRouter already
   * relies on — the `~` absolute marker is restored, child order is the
   * definition order). The tree is the single source of truth, so a third
   * retained copy of the route table (~30 B/route) is not kept. Every reader
   * is a cold CRUD/plugin-registration path; the derive is O(N).
   *
   * The returned array is a FRESH snapshot each time — mutating it never
   * affects the store (pass an explicitly-mutated snapshot to
   * `commitTreeChanges` instead, as `remove` does).
   */
  readonly definitions: RouteDefinition[];
  readonly config: RouteConfig;
  tree: RouteTree;
  matcher: Matcher;
  /**
   * Per-route-name cache of URL (path) param names, derived from `matcher` and
   * read by `RoutesNamespace.getUrlParams` (powers `areStatesEqual` /
   * `isActiveRoute`). Cleared on every `matcher` rebuild so comparisons never
   * stay frozen to a route's pre-mutation param shape (#723).
   */
  readonly urlParamsCache: Map<string, string[]>;
  resolvedForwardMap: Record<string, string>;
  routeCustomFields: Record<string, Record<string, unknown>>;
  rootPath: string;
  readonly matcherOptions: CreateMatcherOptions | undefined;
  depsStore: RoutesDependencies<Dependencies> | undefined;
  lifecycleNamespace: RouteLifecycleNamespace<Dependencies> | undefined;
  readonly pendingCanActivate: Map<string, GuardFnFactory<Dependencies>>;
  readonly pendingCanDeactivate: Map<string, GuardFnFactory<Dependencies>>;
}

// =============================================================================
// Tree operations
// =============================================================================

function rebuildTree(
  definitions: readonly RouteDefinition[],
  rootPath: string,
  matcherOptions: CreateMatcherOptions | undefined,
): { tree: RouteTree; matcher: Matcher } {
  const tree = createRouteTree(DEFAULT_ROUTE_NAME, rootPath, definitions);
  const matcher = createMatcher(matcherOptions);

  matcher.registerTree(tree);

  return { tree, matcher };
}

/**
 * Rebuilds tree+matcher in place from `definitions` (defaults to the current
 * tree's own derived definitions — the same-table case, e.g. a rootPath
 * change).
 */
export function rebuildTreeInPlace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  definitions: readonly RouteDefinition[] = store.definitions,
): void {
  const result = rebuildTree(definitions, store.rootPath, store.matcherOptions);

  store.tree = result.tree;
  store.matcher = result.matcher;
  store.urlParamsCache.clear();
}

export function commitTreeChanges<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  definitions: readonly RouteDefinition[],
): void {
  rebuildTreeInPlace(store, definitions);
  store.resolvedForwardMap = refreshForwardMap(store.config);
}

// =============================================================================
// Store reset
// =============================================================================

/**
 * Clears all routes and resets config.
 * Does NOT clear lifecycle handlers or state — caller handles that.
 */
export function resetStore<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(store: RoutesStore<Dependencies>): void {
  clearRouteData(store);
  rebuildTreeInPlace(store, []);
}

/**
 * Clears route data without rebuilding the tree.
 * Used by replace() to avoid double rebuild (clearRouteData + commitTreeChanges).
 * `definitions` needs no clearing — it is derived from the tree, which the
 * caller rebuilds (resetStore → empty, replace → the new artifacts).
 */
export function clearRouteData<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(store: RoutesStore<Dependencies>): void {
  Object.assign(store.config, createEmptyConfig());

  store.resolvedForwardMap = Object.create(null) as Record<string, string>;
  store.routeCustomFields = Object.create(null) as Record<
    string,
    Record<string, unknown>
  >;
}

// =============================================================================
// Forward map
// =============================================================================

export function refreshForwardMap(config: RouteConfig): Record<string, string> {
  const map = Object.create(null) as Record<string, string>;

  for (const fromRoute of Object.keys(config.forwardMap)) {
    map[fromRoute] = resolveForwardChain(fromRoute, config.forwardMap);
  }

  return map;
}

// =============================================================================
// Route handler registration
// =============================================================================

/**
 * Throws if `forwardTo` is an async function (native or transpiled). Async
 * forwardTo callbacks break the synchronous matchPath/buildPath contract.
 * Runs inside `registerForwardTo` (the add/replace build path, before any store
 * mutation) AND inside `getRoutesApi`'s `updateForwardTo` (the update path), so
 * `update(name, { forwardTo: async })` is rejected at registration with the same
 * actionable error instead of deferring a generic TypeError to navigation (#967).
 */
export function assertForwardToNotAsync(
  forwardTo: unknown,
  fullName: string,
): void {
  if (typeof forwardTo !== "function") {
    return;
  }

  const isNativeAsync =
    (forwardTo as { constructor: { name: string } }).constructor.name ===
    "AsyncFunction";
  const isTranspiledAsync = (forwardTo as { toString: () => string })
    .toString()
    .includes("__awaiter");

  if (isNativeAsync || isTranspiledAsync) {
    throw new TypeError(
      `forwardTo callback cannot be async for route "${fullName}". ` +
        `Async functions break matchPath/buildPath.`,
    );
  }
}

function registerForwardTo<Dependencies extends DefaultDependencies>(
  route: Route<Dependencies>,
  fullName: string,
  config: RouteConfig,
): void {
  if (route.canActivate) {
    /* v8 ignore next -- @preserve: edge case, both string and function tested separately */
    const forwardTarget =
      typeof route.forwardTo === "string" ? route.forwardTo : "[dynamic]";

    logger.warn(
      "real-router",
      `Route "${fullName}" has both forwardTo and canActivate. ` +
        `canActivate will be ignored because forwardTo creates a redirect (industry standard). ` +
        `Move canActivate to the target route "${forwardTarget}".`,
    );
  }

  if (route.canDeactivate) {
    /* v8 ignore next -- @preserve: edge case, both string and function tested separately */
    const forwardTarget =
      typeof route.forwardTo === "string" ? route.forwardTo : "[dynamic]";

    logger.warn(
      "real-router",
      `Route "${fullName}" has both forwardTo and canDeactivate. ` +
        `canDeactivate will be ignored because forwardTo creates a redirect (industry standard). ` +
        `Move canDeactivate to the target route "${forwardTarget}".`,
    );
  }

  assertForwardToNotAsync(route.forwardTo, fullName);

  // forwardTo is guaranteed to exist at this point
  if (typeof route.forwardTo === "string") {
    config.forwardMap[fullName] = route.forwardTo;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    config.forwardFnMap[fullName] = route.forwardTo!;
  }
}

function registerSingleRouteHandlers<Dependencies extends DefaultDependencies>(
  route: Route<Dependencies>,
  fullName: string,
  config: RouteConfig,
  routeCustomFields: Record<string, Record<string, unknown>>,
  pendingCanActivate: Map<string, GuardFnFactory<Dependencies>>,
  pendingCanDeactivate: Map<string, GuardFnFactory<Dependencies>>,
): void {
  const customFields = Object.fromEntries(
    Object.entries(route).filter(([key]) => !STANDARD_ROUTE_KEYS.has(key)),
  );

  if (Object.keys(customFields).length > 0) {
    routeCustomFields[fullName] = customFields;
  }

  // Guards are collected here and registered into the lifecycle later — by
  // `adoptRouteArtifacts` (add/replace) or `RoutesNamespace.flushPendingGuards`
  // (initial routes, the final step of the Router constructor — #1331) — so
  // the build stays a pure, side-effect-free preparation step.
  if (route.canActivate) {
    pendingCanActivate.set(fullName, route.canActivate);
  }

  if (route.canDeactivate) {
    pendingCanDeactivate.set(fullName, route.canDeactivate);
  }

  if (route.forwardTo) {
    registerForwardTo(route, fullName, config);
  }

  if (route.decodeParams) {
    config.decoders[fullName] = (params: Params): Params =>
      route.decodeParams?.(params) ?? params;
  }

  if (route.encodeParams) {
    config.encoders[fullName] = (params: Params): Params =>
      route.encodeParams?.(params) ?? params;
  }

  if (route.defaultParams) {
    config.defaultParams[fullName] = route.defaultParams;
  }
}

function registerAllRouteHandlers<Dependencies extends DefaultDependencies>(
  routes: readonly Route<Dependencies>[],
  config: RouteConfig,
  routeCustomFields: Record<string, Record<string, unknown>>,
  pendingCanActivate: Map<string, GuardFnFactory<Dependencies>>,
  pendingCanDeactivate: Map<string, GuardFnFactory<Dependencies>>,
  parentName = "",
): void {
  for (const route of routes) {
    const fullName = parentName ? `${parentName}.${route.name}` : route.name;

    registerSingleRouteHandlers(
      route,
      fullName,
      config,
      routeCustomFields,
      pendingCanActivate,
      pendingCanDeactivate,
    );

    if (route.children) {
      registerAllRouteHandlers(
        route.children,
        config,
        routeCustomFields,
        pendingCanActivate,
        pendingCanDeactivate,
        fullName,
      );
    }
  }
}

// =============================================================================
// Prepare-then-commit (issue #698)
//
// add()/replace() build the complete new store state into LOCAL structures, and
// only swap it into the store once every core-level error has surfaced from the
// build itself (async/circular forwardTo throw in registerAllRouteHandlers /
// refreshForwardMap; invalid path constraint throws in rebuildTree). The store
// is mutated only by `adoptRouteArtifacts`, which compiles every prepared guard
// factory BEFORE the swap (#956): a factory that throws on compile (or returns a
// non-function) aborts there, with the store still untouched. So all error
// classes — core-level build errors AND malformed guard factories — surface
// before any mutation, leaving the existing routes intact (full atomicity). The
// silent-corruption cases route-tree never throws on (duplicate name vs an
// existing route, a name duplicated within the batch, missing parent) are caught
// up front by `assertAddable`.
// =============================================================================

/**
 * The fully-built, ready-to-swap result of preparing a route mutation. Holds
 * everything `adoptRouteArtifacts` assigns into the store.
 */
interface RouteArtifacts<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly config: RouteConfig;
  readonly routeCustomFields: Record<string, Record<string, unknown>>;
  readonly pendingCanActivate: Map<string, GuardFnFactory<Dependencies>>;
  readonly pendingCanDeactivate: Map<string, GuardFnFactory<Dependencies>>;
  readonly tree: RouteTree;
  readonly matcher: Matcher;
  readonly resolvedForwardMap: Record<string, string>;
}

/** Null-proto shallow clone of a RouteConfig (preserves every sub-map's contents). */
function cloneConfig(config: RouteConfig): RouteConfig {
  const clone = createEmptyConfig();

  assignConfigEntries(clone, config);

  return clone;
}

/**
 * Returns a new definitions array with `added` inserted, without mutating the
 * input. For a top-level add the existing definitions are shallow-copied and
 * `added` appended. For a parented add the spine down to the parent is cloned
 * (siblings/other branches are shared by reference) and `added` appended to the
 * parent's children. Caller guarantees the parent path exists (see assertAddable).
 */
function insertAddedDefinitions(
  definitions: readonly RouteDefinition[],
  added: RouteDefinition[],
  parentSegments: readonly string[],
): RouteDefinition[] {
  if (parentSegments.length === 0) {
    return [...definitions, ...added];
  }

  const [head, ...rest] = parentSegments;

  return definitions.map((def) => {
    if (def.name !== head) {
      return def;
    }

    const children = def.children ?? [];

    return {
      ...def,
      children:
        rest.length === 0
          ? [...children, ...added]
          : insertAddedDefinitions(children, added, rest),
    };
  });
}

/** Depth-first walk yielding each route's full dotted name (no side effects). */
function walkRouteNames<Dependencies extends DefaultDependencies>(
  routes: readonly Route<Dependencies>[],
  parentName: string,
  onName: (fullName: string) => void,
): void {
  for (const route of routes) {
    const fullName = parentName ? `${parentName}.${route.name}` : route.name;

    onName(fullName);

    if (route.children) {
      walkRouteNames(route.children, fullName, onName);
    }
  }
}

/**
 * Rejects a route name duplicated WITHIN a single batch — the silent-overwrite
 * case route-tree stays last-wins on (#953 for `add`, #968 for `replace`). Walks
 * the same depth-first dotted names, but tracks them in a local Set: a name seen
 * twice in one array means the caller's second route would silently shadow the
 * first (`matchPath` for the first route's path becomes unreachable). Mirrors
 * validation-plugin's batch-dup message (route-tree `checkBatchNameDuplicate`)
 * so the no-plugin error matches the with-plugin one. `methodName` is "addRoute"
 * for both add and replace — the plugin reports "addRoute" for replace batches
 * too, so this keeps with/without-plugin parity.
 */
export function assertNoDuplicateNamesInBatch<
  Dependencies extends DefaultDependencies,
>(
  routes: readonly Route<Dependencies>[],
  parentName: string,
  methodName: string,
): void {
  const seen = new Set<string>();

  walkRouteNames(routes, parentName, (fullName) => {
    if (seen.has(fullName)) {
      throw new Error(
        `[router.${methodName}] Duplicate route "${fullName}" in batch`,
      );
    }

    seen.add(fullName);
  });
}

const INTERNAL_ROUTE_PREFIX = "@@";

/**
 * Rejects a single (bare) route name that uses the reserved "@@" prefix —
 * internal / system names such as UNKNOWN_ROUTE (`"@@router/UNKNOWN_ROUTE"`).
 * Mutating such a name would let a real URL `matchPath` to a state with
 * `name === UNKNOWN_ROUTE`, silently conflating a genuine route with "not
 * found". This always-on guard protected all four mutators (#238) until the
 * validation-extraction (`d1ebff80`) demoted it to the opt-in
 * validation-plugin; only `add` was restored (#954), so `remove`/`update`
 * regained it via this helper (#1047). Mirrors validation-plugin's
 * `throwIfInternalRoute` message so the no-plugin error matches the with-plugin
 * one.
 */
export function assertNoInternalRouteName(
  name: string,
  methodName: string,
): void {
  if (name.startsWith(INTERNAL_ROUTE_PREFIX)) {
    throw new Error(
      `[router.${methodName}] Route name "${name}" uses the reserved "${INTERNAL_ROUTE_PREFIX}" prefix. Routes with this prefix are internal and cannot be modified through the public API.`,
    );
  }
}

/**
 * Batch counterpart to {@link assertNoInternalRouteName}: rejects any route in
 * the batch (recursing children) whose BARE leaf name uses the reserved "@@"
 * prefix (the prefix is on the leaf, not the dotted fullName). Used by `add`
 * (#954) and `replace` (#1047).
 */
export function assertNoInternalNamesInBatch<
  Dependencies extends DefaultDependencies,
>(routes: readonly Route<Dependencies>[], methodName: string): void {
  for (const route of routes) {
    assertNoInternalRouteName(route.name, methodName);

    if (route.children) {
      assertNoInternalNamesInBatch(route.children, methodName);
    }
  }
}

/**
 * Rejects two routes that share the same `path` at the same parent level WITHIN
 * a single `add` batch (#955). The matcher resolves a path collision last-wins,
 * so the earlier route stays addressable by name (`has` / `buildPath`) but is
 * unreachable by URL (`matchPath` returns the later route) — a silent shadow.
 * Paths only collide among siblings, so seen paths are tracked per parent
 * fullName. Mirrors validation-plugin's message (route-tree
 * `checkBatchPathDuplicate`) so the no-plugin error matches the with-plugin one.
 * Scoped to the batch (not the existing tree) per #955 — the in-batch case the
 * issue describes.
 */
export function assertNoDuplicatePathsInBatch<
  Dependencies extends DefaultDependencies,
>(
  routes: readonly Route<Dependencies>[],
  parentName: string,
  methodName: string,
): void {
  const seenByParent = new Map<string, Set<string>>();

  const walk = (
    siblings: readonly Route<Dependencies>[],
    parent: string,
  ): void => {
    for (const route of siblings) {
      const paths = seenByParent.get(parent);

      if (paths?.has(route.path)) {
        throw new Error(
          `[router.${methodName}] Path "${route.path}" is already defined`,
        );
      }

      if (paths) {
        paths.add(route.path);
      } else {
        seenByParent.set(parent, new Set([route.path]));
      }

      if (route.children) {
        walk(route.children, parent ? `${parent}.${route.name}` : route.name);
      }
    }
  };

  walk(routes, parentName);
}

/**
 * Up-front guard for `add` against the corruptions route-tree stays silent on: a
 * missing `parent`, a name that collides with an EXISTING route, a name
 * duplicated WITHIN the batch, a reserved "@@"-prefixed name (which would shadow
 * an internal/system route name), and a path duplicated among siblings WITHIN
 * the batch (any of which would otherwise be silently overwritten/shadowed).
 * Throws before any build.
 */
export function assertAddable<Dependencies extends DefaultDependencies>(
  store: RoutesStore<Dependencies>,
  routes: readonly Route<Dependencies>[],
  parentName: string | undefined,
): void {
  assertNoInternalNamesInBatch(routes, "addRoute");

  if (parentName !== undefined && !store.matcher.hasRoute(parentName)) {
    throw new Error(
      `[router.addRoute] Parent route "${parentName}" does not exist`,
    );
  }

  walkRouteNames(routes, parentName ?? "", (fullName) => {
    if (store.matcher.hasRoute(fullName)) {
      throw new Error(`[router.addRoute] Route "${fullName}" already exists`);
    }
  });

  assertNoDuplicateNamesInBatch(routes, parentName ?? "", "addRoute");
  assertNoDuplicatePathsInBatch(routes, parentName ?? "", "addRoute");
}

/**
 * Builds RouteArtifacts from a final definitions array and the routes whose
 * handlers (config + guards) populate `config`/`routeCustomFields`. Guards are
 * collected into the returned pending maps (depsStore is intentionally omitted
 * so nothing compiles or touches the lifecycle here). THROWS on async/circular
 * forwardTo and invalid path constraint — before the caller mutates the store.
 */
function buildArtifacts<Dependencies extends DefaultDependencies>(
  definitions: readonly RouteDefinition[],
  routesForHandlers: readonly Route<Dependencies>[],
  config: RouteConfig,
  routeCustomFields: Record<string, Record<string, unknown>>,
  handlerParentName: string,
  rootPath: string,
  matcherOptions: CreateMatcherOptions | undefined,
): RouteArtifacts<Dependencies> {
  const pendingCanActivate = new Map<string, GuardFnFactory<Dependencies>>();
  const pendingCanDeactivate = new Map<string, GuardFnFactory<Dependencies>>();

  registerAllRouteHandlers(
    routesForHandlers,
    config,
    routeCustomFields,
    pendingCanActivate,
    pendingCanDeactivate,
    handlerParentName,
  );

  const resolvedForwardMap = refreshForwardMap(config);
  const { tree, matcher } = rebuildTree(definitions, rootPath, matcherOptions);

  return {
    config,
    routeCustomFields,
    pendingCanActivate,
    pendingCanDeactivate,
    tree,
    matcher,
    resolvedForwardMap,
  };
}

/** Builds the merged artifacts for an incremental `add` (existing ∪ new). */
export function buildAddArtifacts<Dependencies extends DefaultDependencies>(
  store: RoutesStore<Dependencies>,
  routes: readonly Route<Dependencies>[],
  parentName: string | undefined,
): RouteArtifacts<Dependencies> {
  const definitions = insertAddedDefinitions(
    store.definitions,
    routes.map((route) => sanitizeRoute(route)),
    parentName === undefined ? [] : parentName.split("."),
  );

  return buildArtifacts(
    definitions,
    routes,
    cloneConfig(store.config),
    Object.assign(
      Object.create(null) as Record<string, Record<string, unknown>>,
      store.routeCustomFields,
    ),
    parentName ?? "",
    store.rootPath,
    store.matcherOptions,
  );
}

/** Builds the fresh artifacts for a full `replace` (standalone new set). */
export function buildReplaceArtifacts<Dependencies extends DefaultDependencies>(
  routes: readonly Route<Dependencies>[],
  rootPath: string,
  matcherOptions: CreateMatcherOptions | undefined,
): RouteArtifacts<Dependencies> {
  return buildArtifacts(
    routes.map((route) => sanitizeRoute(route)),
    routes,
    createEmptyConfig(),
    Object.create(null) as Record<string, Record<string, unknown>>,
    "",
    rootPath,
    matcherOptions,
  );
}

/**
 * Compiles every pending guard factory up front, returning
 * `[name, factory, compiledFn]` triples for installation. THROWS from `compile`
 * on the first factory that throws on compile or returns a non-function — the
 * pre-swap validation that makes `adoptRouteArtifacts` atomic for malformed
 * guards (#956). Compiling here (not at install) means a factory with
 * compile-time side effects runs exactly once.
 */
function compilePendingGuards<Dependencies extends DefaultDependencies>(
  pending: Map<string, GuardFnFactory<Dependencies>>,
  compile: (
    handler: GuardFnFactory<Dependencies>,
    methodName: string,
  ) => GuardFn,
  methodName: string,
): [string, GuardFnFactory<Dependencies>, GuardFn][] {
  const compiled: [string, GuardFnFactory<Dependencies>, GuardFn][] = [];

  for (const [name, factory] of pending) {
    compiled.push([name, factory, compile(factory, methodName)]);
  }

  return compiled;
}

/** Pre-compiled guard triples for {@link adoptRouteArtifacts} install. */
export interface CompiledArtifactGuards<
  Dependencies extends DefaultDependencies,
> {
  activate: [string, GuardFnFactory<Dependencies>, GuardFn][];
  deactivate: [string, GuardFnFactory<Dependencies>, GuardFn][];
}

/**
 * Compiles an artifacts' pending guard factories up front (#956), THROWING on
 * the first factory that throws on compile or returns a non-function.
 *
 * `replaceRoutes` calls this in its PREPARE phase — **before**
 * `clearDefinitionGuards()` — and hands the result to `adoptRouteArtifacts`, so
 * a compile-throw aborts with BOTH the tree AND the old definition guards intact
 * (#1193, mirroring #1046's handler-limit hoist). `add` has no clear step, so
 * `adoptRouteArtifacts` compiles inline for it.
 */
export function compileArtifactGuards<Dependencies extends DefaultDependencies>(
  artifacts: RouteArtifacts<Dependencies>,
  deps: RoutesDependencies<Dependencies>,
): CompiledArtifactGuards<Dependencies> {
  return {
    activate: compilePendingGuards(
      artifacts.pendingCanActivate,
      deps.compileGuard,
      "canActivate",
    ),
    deactivate: compilePendingGuards(
      artifacts.pendingCanDeactivate,
      deps.compileGuard,
      "canDeactivate",
    ),
  };
}

/**
 * Commits prepared artifacts into the store in place. Every pending guard
 * factory is compiled BEFORE the tree/config swap (#956): a factory that throws
 * on compile (or returns a non-function) aborts here with the store untouched,
 * so `add`/`replace` are atomic for malformed guards too — not just core build
 * errors. The tree/config assignments are pure and cannot throw; the
 * pre-compiled guards are then installed without re-compiling (the factory ran
 * once, at the pre-compile above). `depsStore` is always set on a wired router,
 * which is the only path that reaches `add`/`replace`.
 */
export function adoptRouteArtifacts<Dependencies extends DefaultDependencies>(
  store: RoutesStore<Dependencies>,
  artifacts: RouteArtifacts<Dependencies>,
  precompiled?: CompiledArtifactGuards<Dependencies>,
): void {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- depsStore is set once the router is wired; add/replace only run on a wired router (constructor-time registration uses createRoutesStore)
  const deps = store.depsStore!;

  // Pre-swap compile: surfaces a malformed guard factory before any mutation.
  // `replace()` pre-compiles in its PREPARE phase (BEFORE clearDefinitionGuards)
  // and passes the result here, so a compile-throw never erases the old
  // definition guards (#1193); `add` has no clear step and compiles inline.
  const { activate: compiledActivate, deactivate: compiledDeactivate } =
    precompiled ?? compileArtifactGuards(artifacts, deps);

  // Atomic swap — pure assignments, cannot throw. (`definitions` is derived
  // from `tree`, so swapping the tree IS the definitions swap.)
  Object.assign(store.config, artifacts.config);
  store.routeCustomFields = artifacts.routeCustomFields;
  store.tree = artifacts.tree;
  store.matcher = artifacts.matcher;
  store.urlParamsCache.clear();
  store.resolvedForwardMap = artifacts.resolvedForwardMap;

  // Install pre-compiled guards — no re-compile, no throw.
  for (const [name, factory, fn] of compiledActivate) {
    deps.addActivateGuard(name, factory, fn);
  }

  for (const [name, factory, fn] of compiledDeactivate) {
    deps.addDeactivateGuard(name, factory, fn);
  }
}

/**
 * COMMIT core for `update()` — the field-patch counterpart to
 * {@link adoptRouteArtifacts} (add/replace) / {@link commitTreeChanges} (remove)
 * / {@link resetStore} (clear), co-located here so all four route-CRUD commit
 * cores live in one file. Stays **NO_TREE_REBUILD**: an O(1) per-field patch
 * that never rebuilds the tree/matcher (so it must NOT funnel through
 * `adoptRouteArtifacts`).
 *
 * Prepare-then-commit (#951): every throwing step runs in PREPARE, before any
 * store write, so a rejected update leaves the route's prior config fully intact
 * — an async/cyclic `forwardTo` (#967), a guard factory that throws on compile
 * (#956 seam), a throwing custom-field getter, and the #961 handler-limit
 * pre-flight (#1046). Returns the structural fields for the caller's conditional
 * TREE_CHANGED emit, computed from the single destructure here so core invokes
 * each user getter once (#797 / #952 `null`-clears-definition-only preserved).
 */
export function commitRouteUpdate<Dependencies extends DefaultDependencies>(
  store: RoutesStore<Dependencies>,
  lifecycle: RouteLifecycleNamespace<Dependencies>,
  name: string,
  updates: RouteConfigUpdate<Dependencies>,
): {
  forwardTo?: string | ForwardToCallback<Dependencies> | null | undefined;
  defaultParams?: Params | null | undefined;
  decodeParams?: ((params: Params) => Params) | null | undefined;
  encodeParams?: ((params: Params) => Params) | null | undefined;
} {
  const {
    forwardTo,
    defaultParams,
    decodeParams,
    encodeParams,
    canActivate,
    canDeactivate,
  } = updates;

  // ===== PREPARE — compute every change into LOCALS. Any throw here aborts
  // before a single store write, so the whole field set is applied
  // all-or-nothing (#951).
  const forwardToPlan =
    forwardTo === undefined
      ? undefined
      : prepareForwardTo(name, forwardTo, store.config);

  const nextCustomFields = prepareCustomFields(store, name, updates);

  // Guard factories are compiled NOW (a throwing factory surfaces in PREPARE);
  // the precompiled function is installed in COMMIT without re-invoking the
  // factory, so a factory side effect runs exactly once (reuses the #956
  // compile-then-install seam). Compiled after the other prepares so a throw
  // upstream skips invoking the factory at all.
  const activateFn =
    canActivate === undefined || canActivate === null
      ? undefined
      : lifecycle.compileGuardFactory(canActivate, "canActivate");
  const deactivateFn =
    canDeactivate === undefined || canDeactivate === null
      ? undefined
      : lifecycle.compileGuardFactory(canDeactivate, "canDeactivate");

  // Pre-flight the #961 handler-limit before the COMMIT writes, so an at-limit
  // update that adds a NEW guard slot aborts before forwardTo / scalar config
  // land (#1046, #951). A slot is new only when `name` does not already hold a
  // guard of that type — an overwrite does not count.
  lifecycle.preflightHandlerLimit(
    activateFn === undefined ? [] : [name],
    deactivateFn === undefined ? [] : [name],
    false,
  );

  // ===== COMMIT — pure writes from here; nothing below throws.
  // Custom (plugin-defined) fields. Consumers read these lazily via
  // getRouteConfig (lifecycle hooks, preload, searchSchema), so no TREE_CHANGED
  // is needed — the next read sees the new value; the caller's emit stays
  // structural-only by design (О-7).
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

  // Install the guards from their PREPARE-phase precompiled functions; a `null`
  // clears the definition-origin guard only (#952). See commitGuardUpdate.
  commitGuardUpdate(lifecycle, "activate", name, canActivate, activateFn);
  commitGuardUpdate(lifecycle, "deactivate", name, canDeactivate, deactivateFn);

  return { forwardTo, defaultParams, decodeParams, encodeParams };
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
      lifecycle.clearCanActivate(name, "definition");
    } else {
      lifecycle.addCanActivate(name, value, true, precompiledFn);
    }
  } else if (value === null) {
    lifecycle.clearCanDeactivate(name, "definition");
  } else {
    lifecycle.addCanDeactivate(name, value, true, precompiledFn);
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createRoutesStore<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  routes: Route<Dependencies>[],
  matcherOptions?: CreateMatcherOptions,
): RoutesStore<Dependencies> {
  // Initial routes are a standalone set at rootPath "" — same build the
  // prepare-then-commit `replace` path uses. Guards land in the pending maps,
  // flushed by `flushPendingGuards()` at the end of the Router constructor
  // (#1331); `setDependencies` itself is a pure assignment.
  //
  // Reject the silent-corruption cases BEFORE building, giving the constructor
  // parity with `add()` / `replace()` — the third and last route-population
  // entry point (#1351): within-batch duplicate names (#953/#968) and reserved
  // "@@" names (#954). Without these the constructor silently last-wins a
  // duplicate-name sibling (the first route is dropped → its deep-link 404s)
  // while add/replace throw. `methodName` is "addRoute" so all three entry
  // points surface the identical bare-core error. (Duplicate PATHS are already
  // rejected downstream by the path-matcher backstop #1153, so they are not
  // re-checked here.)
  assertNoInternalNamesInBatch(routes, "addRoute");
  assertNoDuplicateNamesInBatch(routes, "", "addRoute");

  const artifacts = buildReplaceArtifacts(routes, "", matcherOptions);

  const store: RoutesStore<Dependencies> = {
    // Deferred access: the getter runs only after `store` is initialized.
    get definitions() {
      return routeTreeToDefinitions(store.tree);
    },
    config: artifacts.config,
    tree: artifacts.tree,
    matcher: artifacts.matcher,
    urlParamsCache: new Map(),
    resolvedForwardMap: artifacts.resolvedForwardMap,
    routeCustomFields: artifacts.routeCustomFields,
    rootPath: "",
    matcherOptions,
    depsStore: undefined,
    lifecycleNamespace: undefined,
    pendingCanActivate: artifacts.pendingCanActivate,
    pendingCanDeactivate: artifacts.pendingCanDeactivate,
  };

  return store;
}
