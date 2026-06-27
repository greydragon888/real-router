// packages/core/src/namespaces/RoutesNamespace/routesStore.ts

import { logger } from "@real-router/logger";
import { createMatcher, createRouteTree } from "route-tree";

import { DEFAULT_ROUTE_NAME, STANDARD_ROUTE_KEYS } from "./constants";
import { resolveForwardChain } from "./forwardChain";
import { createEmptyConfig, sanitizeRoute } from "./helpers";

import type { RouteConfig, RoutesDependencies } from "./types";
import type { GuardFnFactory, Route } from "../../types";
import type { RouteLifecycleNamespace } from "../RouteLifecycleNamespace";
import type { DefaultDependencies, GuardFn, Params } from "@real-router/types";
import type {
  CreateMatcherOptions,
  Matcher,
  RouteDefinition,
  RouteTree,
} from "route-tree";

// =============================================================================
// Interfaces
// =============================================================================

export interface RoutesStore<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
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
  definitions: RouteDefinition[],
  rootPath: string,
  matcherOptions: CreateMatcherOptions | undefined,
): { tree: RouteTree; matcher: Matcher } {
  const tree = createRouteTree(DEFAULT_ROUTE_NAME, rootPath, definitions);
  const matcher = createMatcher(matcherOptions);

  matcher.registerTree(tree);

  return { tree, matcher };
}

export function rebuildTreeInPlace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(store: RoutesStore<Dependencies>): void {
  const result = rebuildTree(
    store.definitions,
    store.rootPath,
    store.matcherOptions,
  );

  store.tree = result.tree;
  store.matcher = result.matcher;
  store.urlParamsCache.clear();
}

export function commitTreeChanges<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(store: RoutesStore<Dependencies>): void {
  rebuildTreeInPlace(store);
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
  rebuildTreeInPlace(store);
}

/**
 * Clears route data without rebuilding the tree.
 * Used by replace() to avoid double rebuild (clearRouteData + commitTreeChanges).
 */
export function clearRouteData<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(store: RoutesStore<Dependencies>): void {
  store.definitions.length = 0;

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
  // `adoptRouteArtifacts` (add/replace) or `setDependencies` (initial routes) —
  // so the build stays a pure, side-effect-free preparation step.
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
  readonly definitions: RouteDefinition[];
  readonly config: RouteConfig;
  readonly routeCustomFields: Record<string, Record<string, unknown>>;
  readonly pendingCanActivate: Map<string, GuardFnFactory<Dependencies>>;
  readonly pendingCanDeactivate: Map<string, GuardFnFactory<Dependencies>>;
  readonly tree: RouteTree;
  readonly matcher: Matcher;
  readonly resolvedForwardMap: Record<string, string>;
}

/** Null-proto shallow clone of a RouteConfig (preserves the 5 maps' contents). */
function cloneConfig(config: RouteConfig): RouteConfig {
  const clone = createEmptyConfig();

  Object.assign(clone.decoders, config.decoders);
  Object.assign(clone.encoders, config.encoders);
  Object.assign(clone.defaultParams, config.defaultParams);
  Object.assign(clone.forwardMap, config.forwardMap);
  Object.assign(clone.forwardFnMap, config.forwardFnMap);

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
 * Rejects routes whose (bare) name uses the reserved "@@" prefix — internal /
 * system names such as UNKNOWN_ROUTE (`"@@router/UNKNOWN_ROUTE"`). Without this
 * guard a public `add` could register a route whose name equals the not-found
 * sentinel, so a real URL would `matchPath` to a state with `name ===
 * UNKNOWN_ROUTE`, silently conflating a genuine route with "not found" (#954).
 * Checks the BARE leaf name (the prefix is on the leaf, not the dotted fullName)
 * and recurses children. Mirrors validation-plugin's `throwIfInternalRoute`
 * message so the no-plugin error matches the with-plugin one.
 */
export function assertNoInternalNamesInBatch<
  Dependencies extends DefaultDependencies,
>(routes: readonly Route<Dependencies>[], methodName: string): void {
  for (const route of routes) {
    if (route.name.startsWith(INTERNAL_ROUTE_PREFIX)) {
      throw new Error(
        `[router.${methodName}] Route name "${route.name}" uses the reserved "${INTERNAL_ROUTE_PREFIX}" prefix. Routes with this prefix are internal and cannot be modified through the public API.`,
      );
    }

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
  definitions: RouteDefinition[],
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
    definitions,
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
): void {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- depsStore is set once the router is wired; add/replace only run on a wired router (constructor-time registration uses createRoutesStore)
  const deps = store.depsStore!;

  // Pre-swap compile: surfaces a malformed guard factory before any mutation.
  const compiledActivate = compilePendingGuards(
    artifacts.pendingCanActivate,
    deps.compileGuard,
    "canActivate",
  );
  const compiledDeactivate = compilePendingGuards(
    artifacts.pendingCanDeactivate,
    deps.compileGuard,
    "canDeactivate",
  );

  // Atomic swap — pure assignments, cannot throw.
  store.definitions.length = 0;

  for (const def of artifacts.definitions) {
    store.definitions.push(def);
  }

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
  // prepare-then-commit `replace` path uses. Guards land in the pending maps
  // (depsStore is wired later via setDependencies, which flushes them).
  const artifacts = buildReplaceArtifacts(routes, "", matcherOptions);

  return {
    definitions: artifacts.definitions,
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
}
