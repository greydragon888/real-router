// packages/core/src/namespaces/RoutesNamespace/routesStore.ts

import { DEFAULT_ROUTE_NAME, STANDARD_ROUTE_KEYS } from "./constants";
import { resolveForwardChain } from "./forwardChain";
import {
  anyForwardConfigured,
  assertRouteDefaultChannelsFor,
  assignConfigEntries,
  createEmptyConfig,
  queryParamsOf,
  sanitizeRoute,
} from "./helpers";
import { assertChannelCorrect } from "../../channels";
import {
  assertNoDottedRouteName,
  assertRouteNameNotEmpty,
  createMatcher,
  createRouteTree,
  routeTreeToDefinitions,
} from "../../engine";
import { assertRouteNameIsString } from "../../guards";
import { putField } from "../../utils/ingest";

import type { RouteConfig, RoutesDependencies } from "./types";
import type {
  CreateMatcherOptions,
  Matcher,
  RouteDefinition,
  RouteTree,
} from "../../engine";
import type {
  DefaultDependencies,
  ForwardToCallback,
  GuardFn,
  Params,
  ParamsSearch,
  SearchParams,
  RouteConfigUpdate,
  RouterLogger,
  GuardFnFactory,
  Route,
} from "../../types";
import type { RouteLifecycleNamespace } from "../RouteLifecycleNamespace";

/** Captured like the deciding seven, but this one BUILDS the guarantee (#2072). */
const objectCreate = Object.create;

const objectEntries = Object.entries;
const objectKeys = Object.keys;

/**
 * Intrinsics captured at module load: `defineProperty`.
 *
 * ⚑ Two of the three `__proto__` write primitives in core were captured a
 * commit earlier, and THIS one — whose own comment names both of them as the
 * mirrors it follows — was left reading the global. Measured with a naive
 * polyfill after boot: the record's prototype is replaced, the field vanishes
 * from own keys, and a key nobody set reads back through `getRouteConfig`,
 * which plugins index by key. #1788 verbatim, while both captured mirrors held
 * under the identical tamper.
 *
 * ⚠ It does NOT close a shim evaluated BEFORE this module — see the sibling
 * headers in `src/engine`.
 */
const defineProperty = Object.defineProperty;
const fromEntries = Object.fromEntries;
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
  /**
   * Per-route-name cache of declared query param names (`?a&b` across the
   * route's segments), read by `RoutesNamespace.getQueryParams` — THE registry
   * every channel mechanism classifies through and the URL build prints from
   * (#1556). Same lifecycle as `urlParamsCache`: cleared on every `matcher`
   * rebuild.
   */
  readonly queryParamsCache: Map<string, string[]>;
  resolvedForwardMap: Record<string, string>;

  /**
   * Does ANY route in the tree forward? Read by `isActiveRoute` before its
   * `forwardTo` arm's per-route gate, and worth its own field for a reason that
   * is measurable rather than aesthetic (#1595): the two maps behind that gate
   * are `Object.create(null)` dictionaries, which V8 keeps in dictionary mode,
   * and two lookups on them cost ~14 ns — paid by every route in the tree for a
   * feature only forwarding routes use, on every `<Link>` render across six
   * adapters. A tree with no `forwardTo` at all — the common case — answers with
   * one boolean load instead.
   *
   * ⚠ Maintained ONLY through {@link adoptForwardState}, together with
   * `resolvedForwardMap`. The two are views of the same config and a stale
   * `false` here silently switches the arm OFF, which is a correctness bug
   * wearing a performance change's clothes: a `<Link>` to a forwarding route
   * would render inactive again (the defect #1573 shipped the arm to fix).
   * Pinned in `tests/functional/routes/isActiveRoute.test.ts`, describe
   * `"forwardTo arm survives route-CRUD (#1595)"` — and the generative pin in
   * `tests/property/cloneRouter.properties.ts`. ⚠ That describe name is
   * narrower than its contents: `cloneRouter` writes forward config without
   * being route-CRUD (#1800), so a clone case lives there too.
   */
  hasAnyForward: boolean;
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
  store.queryParamsCache.clear();
}

/**
 * Prepare-then-commit root-path change.
 *
 * A root `?`-declaration declares the name on EVERY route at once, so a
 * `defaultParams` that was legal a moment ago can stop being legal without any
 * route changing — the one mutation where re-checking the WHOLE config is not
 * redundant. Built into locals first so a rejected root path leaves the store
 * exactly as it was, matching the atomicity `add` / `replace` promise.
 */
export function applyRootPath<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(store: RoutesStore<Dependencies>, newRootPath: string): void {
  const prepared = rebuildTree(
    store.definitions,
    newRootPath,
    store.matcherOptions,
  );

  assertRouteDefaultChannelsFor(prepared.matcher, store.config, "setRootPath");

  store.rootPath = newRootPath;
  store.tree = prepared.tree;
  store.matcher = prepared.matcher;
  store.urlParamsCache.clear();
  store.queryParamsCache.clear();
}

export function commitTreeChanges<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  definitions: readonly RouteDefinition[],
): void {
  rebuildTreeInPlace(store, definitions);
  adoptForwardState(store, refreshForwardMap(store.config));
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

  adoptForwardState(store, objectCreate(null) as Record<string, string>);
  store.routeCustomFields = objectCreate(null) as Record<
    string,
    Record<string, unknown>
  >;
}

// =============================================================================
// Forward map
// =============================================================================

/**
 * The ONE way `resolvedForwardMap` and `hasAnyForward` move (#1595). They are two
 * views of the same forward config, so every site that re-derives one derives the
 * other here — a site that assigned only the map would leave a stale `false`
 * behind, and `isActiveRoute` would stop consulting its `forwardTo` arm.
 *
 * ⚠ EXPORTED for `cloneRouter` (#1800), which is the one writer of forward
 * config outside this module. It assigned only the map, and the stale `false`
 * this docstring predicts is exactly what shipped: every SSR clone answered
 * `isActiveRoute` = `false` for every forwarding route. Keep new writers going
 * through here rather than deriving the flag themselves — the field's own
 * comment says "maintained ONLY through" this function, and a third writer is
 * how the next one gets missed.
 *
 * ⚠ `resolved` is ASSIGNED, not merged. A caller that must keep its store's own
 * map object (`cloneRouter` does — sharing the source's would alias the two
 * stores) passes `Object.assign(store.resolvedForwardMap, incoming)`, which
 * returns that same object.
 */
export function adoptForwardState<Dependencies extends DefaultDependencies>(
  store: RoutesStore<Dependencies>,
  resolved: Record<string, string>,
): void {
  store.resolvedForwardMap = resolved;
  store.hasAnyForward = anyForwardConfigured(store.config);
}

export function refreshForwardMap(config: RouteConfig): Record<string, string> {
  const map = objectCreate(null) as Record<string, string>;

  for (const fromRoute of objectKeys(config.forwardMap)) {
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
  logger: RouterLogger,
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
  logger: RouterLogger,
): void {
  const customFields = fromEntries(
    objectEntries(route).filter(([key]) => !STANDARD_ROUTE_KEYS.has(key)),
  );

  if (objectKeys(customFields).length > 0) {
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
    registerForwardTo(route, fullName, config, logger);
  }

  if (route.decodeParams) {
    const decode = route.decodeParams;

    config.decoders[fullName] = (channels: ParamsSearch): ParamsSearch =>
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime fallback if a user-provided decoder violates its `{ params, search }` return type
      decode(channels) ?? channels;
  }

  if (route.encodeParams) {
    const encode = route.encodeParams;

    config.encoders[fullName] = (channels: ParamsSearch): ParamsSearch =>
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime fallback if a user-provided encoder violates its `{ params, search }` return type
      encode(channels) ?? channels;
  }

  if (route.defaultParams) {
    config.defaultParams[fullName] = route.defaultParams;
  }

  if (route.defaultSearch) {
    config.defaultSearch[fullName] = route.defaultSearch;
  }
}

function registerAllRouteHandlers<Dependencies extends DefaultDependencies>(
  routes: readonly Route<Dependencies>[],
  config: RouteConfig,
  routeCustomFields: Record<string, Record<string, unknown>>,
  pendingCanActivate: Map<string, GuardFnFactory<Dependencies>>,
  pendingCanDeactivate: Map<string, GuardFnFactory<Dependencies>>,
  logger: RouterLogger,
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
      logger,
    );

    if (route.children) {
      registerAllRouteHandlers(
        route.children,
        config,
        routeCustomFields,
        pendingCanActivate,
        pendingCanDeactivate,
        logger,
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

/**
 * One read per own key of every route definition in a batch (#1899).
 *
 * Read per consumer instead, registration reads each definition many times —
 * measured, `route.name` seven times for one `add`: the reserved-prefix walker,
 * the dotted-name walker, `walkRouteNames` twice, `sanitizeRoute`,
 * `registerAllRouteHandlers`, and the `Object.entries` that collects custom
 * fields. Every read is an independent question, so a definition whose `name` is
 * an accessor is VALIDATED under one answer and REGISTERED under another:
 *
 *     add([{ get name() { return ++n <= 4 ? "safe" : "@@router/UNKNOWN_ROUTE" }, … }])
 *       → accepted; has("safe") === false; has("@@router/UNKNOWN_ROUTE") === true
 *
 * — i.e. the reserved-prefix rule (#1047) and the dotted-name rule (#1763) were
 * both walked past, while the literal spelling of either is refused. Snapshot
 * first and every existing guard becomes correct by construction, which is the
 * one thing hardening each reader separately cannot do.
 *
 * ⚑ A spread, deliberately: own enumerable keys are exactly the supported input
 * surface (`packages/core/CLAUDE.md`, "Supported Input Shapes" — owner decision
 * 2026-08-18), so this drops nothing core was contracted to read. It also
 * DEFINES rather than assigns, so a custom field literally named `"__proto__"`
 * survives as data.
 *
 * ⚠ `children` is re-checked with `Array.isArray` rather than for truthiness:
 * a malformed non-array must keep failing where it fails today, in the reader
 * that consumes it, instead of throwing a different message from here.
 *
 * ⚠ **This does NOT run before every guard, and it must not.**
 * `guardRouteStructure` runs FIRST and reads `children` to walk into it, so that
 * one key is read twice — pinned as `registration · route.children` in
 * `read-count-authority`. Moving the snapshot ahead of it would defeat it
 * entirely: a spread turns every value that guard exists to refuse into a plain
 * object — `{...null}`, `{...42}`, `{...true}` and `{...undefined}` are all
 * `{}`, `{..."ab"}` is `{0:"a",1:"b"}`, and `{...[x]}` is `{0:x}` — so the
 * structural check has to see the caller's actual value. Measured: the window
 * this leaves is not exploitable, because a `children` that drifts between the
 * two reads is still refused downstream, only with a different message.
 */
export function snapshotRouteBatch<Dependencies extends DefaultDependencies>(
  routes: readonly Route<Dependencies>[],
): Route<Dependencies>[] {
  return routes.map((route) => {
    const snapshot = { ...route };

    if (Array.isArray(snapshot.children)) {
      snapshot.children = snapshotRouteBatch(snapshot.children);
    }

    return snapshot;
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
  name: unknown,
  methodName: string,
): asserts name is string {
  // ⚑ The type check belongs HERE and not at each door because this is the
  // first always-on name check every one of the five runs — `remove` / `update`
  // call it directly, `add` / `replace` / the constructor through
  // {@link assertNoInternalNamesInBatch} — and {@link assertNoDottedRouteName}
  // already documents that ordering as load-bearing for its own reasoning. So
  // one check covers every caller-supplied route name in core (#1896).
  //
  // ⚠ NOT a gate in the sense of `ARCHITECTURE.md` "Route-Name Type Gates":
  // these doors already refused a non-string, and no door that previously
  // ANSWERED starts refusing. What changes is the SHAPE of the refusal — the
  // `startsWith` below is a string method on a value nothing had type-checked,
  // so bare core answered `TypeError: name.startsWith is not a function`, and
  // `null` / `undefined` leaked `Cannot read properties of null (reading
  // 'startsWith')`. Both name a private local rather than the door.
  //
  // The wording is validation-plugin's `validateRouteName`, byte for byte,
  // including its `typeof` quirks (`typeof null === "object"`) — the same
  // mirroring #1047 and #1763 used, so the no-plugin error matches the
  // with-plugin one. The constructor is the door that gains the most: the
  // plugin installs through `usePlugin`, i.e. after construction, so it never
  // had a message from either layer.
  assertRouteNameIsString(name, methodName);

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
 * Applies {@link assertRouteNameNotEmpty} across a batch, recursing children.
 *
 * ⚑ Refusing the whole batch is what keeps the TREE right, not merely the
 * name: accepted, `{ name: "", children: [...] }` loses its parent and
 * re-parents the children to the root, where they answer to a name the author
 * never wrote (#1804).
 */
export function assertNonEmptyNamesInBatch<
  Dependencies extends DefaultDependencies,
>(routes: readonly Route<Dependencies>[], methodName: string): void {
  for (const route of routes) {
    assertRouteNameNotEmpty(route.name, methodName);

    if (route.children) {
      assertNonEmptyNamesInBatch(route.children, methodName);
    }
  }
}

/**
 * Applies {@link assertNoDottedRouteName} across a batch, recursing children —
 * the check is on the BARE leaf name, so nested routes (whose names are simple
 * by construction) pass and only the dotted spelling is refused.
 *
 * ⚑ Core applies the rule on every registration door; `validateRoute` applies
 * the same predicate only for `@real-router/validation-plugin`. A dotted LEAF
 * is a standalone node whose name merely LOOKS like a path through the tree,
 * and five predicates across four packages read that resemblance as ancestry —
 * `isActiveRoute` reporting a `<Link to="users">` active while the address bar
 * shows another route (#1763), `remove()` purging a surviving route's config
 * and guards (#1757), and the `add` / `buildPath` halves of #1194. Each has a
 * local fix; none of them can be complete, because the resemblance is readable
 * from any name string and the places that read one are not enumerable.
 * Refusing to CREATE the shape makes every one of those predicates correct by
 * construction — including the two (`route-utils`'s exported
 * `areRoutesRelated`, `solid`'s `isRouteActive`) that take names only and have
 * no tree to consult.
 */
export function assertNoDottedNamesInBatch<
  Dependencies extends DefaultDependencies,
>(routes: readonly Route<Dependencies>[], methodName: string): void {
  for (const route of routes) {
    assertNoDottedRouteName(route.name, methodName);

    if (route.children) {
      assertNoDottedNamesInBatch(route.children, methodName);
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
  assertNonEmptyNamesInBatch(routes, "addRoute");
  assertNoDottedNamesInBatch(routes, "addRoute");

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
 *
 * Takes a single args object: the positional list hit 8 parameters (S107) when
 * the per-router `logger` (#724) joined it, and named fields read better at the
 * two call sites anyway.
 */
function buildArtifacts<Dependencies extends DefaultDependencies>({
  definitions,
  routesForHandlers,
  config,
  routeCustomFields,
  handlerParentName,
  rootPath,
  matcherOptions,
  logger,
}: {
  definitions: readonly RouteDefinition[];
  routesForHandlers: readonly Route<Dependencies>[];
  config: RouteConfig;
  routeCustomFields: Record<string, Record<string, unknown>>;
  handlerParentName: string;
  rootPath: string;
  matcherOptions: CreateMatcherOptions | undefined;
  logger: RouterLogger;
}): RouteArtifacts<Dependencies> {
  const pendingCanActivate = new Map<string, GuardFnFactory<Dependencies>>();
  const pendingCanDeactivate = new Map<string, GuardFnFactory<Dependencies>>();

  registerAllRouteHandlers(
    routesForHandlers,
    config,
    routeCustomFields,
    pendingCanActivate,
    pendingCanDeactivate,
    logger,
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
  logger: RouterLogger,
): RouteArtifacts<Dependencies> {
  const definitions = insertAddedDefinitions(
    store.definitions,
    routes.map((route) => sanitizeRoute(route)),
    parentName === undefined ? [] : parentName.split("."),
  );

  return buildArtifacts({
    definitions,
    routesForHandlers: routes,
    config: cloneConfig(store.config),
    routeCustomFields: Object.assign(
      objectCreate(null) as Record<string, Record<string, unknown>>,
      store.routeCustomFields,
    ),
    handlerParentName: parentName ?? "",
    rootPath: store.rootPath,
    matcherOptions: store.matcherOptions,
    logger,
  });
}

/** Builds the fresh artifacts for a full `replace` (standalone new set). */
export function buildReplaceArtifacts<Dependencies extends DefaultDependencies>(
  routes: readonly Route<Dependencies>[],
  rootPath: string,
  matcherOptions: CreateMatcherOptions | undefined,
  logger: RouterLogger,
): RouteArtifacts<Dependencies> {
  return buildArtifacts({
    definitions: routes.map((route) => sanitizeRoute(route)),
    routesForHandlers: routes,
    config: createEmptyConfig(),
    routeCustomFields: objectCreate(null) as Record<
      string,
      Record<string, unknown>
    >,
    handlerParentName: "",
    rootPath,
    matcherOptions,
    logger,
  });
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
 *
 * ⚠ **The config-time channel check (`assertRouteDefaultChannels`) is the
 * CALLER's PREPARE step, not this function's.** Run HERE, one line before the
 * swap, it is early enough for `add` and too late for `replace`: `replace`
 * erases the old definition guards BEFORE calling this, so a batch the check
 * refuses leaves the tree intact and the guards gone — a previously guarded
 * route freely activatable. That is the #1193 fail-open shape verbatim, which is
 * why the guard COMPILE sits in the callers; the channel check sits beside it,
 * for the same reason. Keeping this function
 * throw-free is what makes its "atomic swap" contract true rather than nearly
 * true.
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
  store.queryParamsCache.clear();
  adoptForwardState(store, artifacts.resolvedForwardMap);

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
/**
 * `update` adopts a structural field on the same terms registration does
 * (#1797). `registerSingleRouteHandlers` gates all seven — the two default
 * bags, the two codecs, the two guard factories and `forwardTo` — on
 * TRUTHINESS, and no VALID value of any of them is falsy: a forward target is a
 * non-empty route name, the default bags are objects, the codecs and factories
 * are functions. So a type-invalid falsy is ABSENCE at both doors, instead of
 * registration dropping it while `update` stored it.
 *
 * ⚠ `null` is answered FIRST and passes through untouched — it is falsy, and it
 * is the documented removal marker. `undefined` keeps meaning "said nothing"
 * (#1550 / #1551), which is what a non-adopted value collapses onto.
 *
 * ⚠ What this refuses to store is measured, not stylistic: `decodeParams: 0`
 * reached the decoder slot and turned `matchPath` into a thrower
 * (`decoder is not a function`), and `match()` may not throw on input — its
 * callers in the browser, hash, navigation and SSR packages do not catch.
 */
function adoptable<T>(value: T): T | undefined {
  if (value === null) {
    return value;
  }

  return value || undefined;
}

export function commitRouteUpdate<Dependencies extends DefaultDependencies>(
  store: RoutesStore<Dependencies>,
  lifecycle: RouteLifecycleNamespace<Dependencies>,
  name: string,
  updates: RouteConfigUpdate<Dependencies>,
): {
  forwardTo?: string | ForwardToCallback<Dependencies> | null | undefined;
  defaultParams?: Params | null | undefined;
  defaultSearch?: SearchParams | null | undefined;
  decodeParams?: ((channels: ParamsSearch) => ParamsSearch) | null | undefined;
  encodeParams?: ((channels: ParamsSearch) => ParamsSearch) | null | undefined;
} {
  const {
    forwardTo: rawForwardTo,
    defaultParams: rawDefaultParams,
    defaultSearch: rawDefaultSearch,
    decodeParams: rawDecodeParams,
    encodeParams: rawEncodeParams,
    canActivate: rawCanActivate,
    canDeactivate: rawCanDeactivate,
  } = updates;

  // One rule for all seven, applied to the SINGLE destructure above so each
  // user getter is still invoked exactly once (#797 / #952).
  const forwardTo = adoptable(rawForwardTo);
  const defaultParams = adoptable(rawDefaultParams);
  const defaultSearch = adoptable(rawDefaultSearch);
  const decodeParams = adoptable(rawDecodeParams);
  const encodeParams = adoptable(rawEncodeParams);
  const canActivate = adoptable(rawCanActivate);
  const canDeactivate = adoptable(rawCanDeactivate);

  // ===== PREPARE — compute every change into LOCALS. Any throw here aborts
  // before a single store write, so the whole field set is applied
  // all-or-nothing (#951).

  // Channel check on the INCOMING value, in PREPARE: `update` does not rebuild
  // the tree (NO_TREE_REBUILD), so the route's declarations are the ones the
  // matcher already holds. Checked before any write, so a mis-channelled
  // `defaultParams` aborts the whole update rather than landing half-applied.
  if (defaultParams !== undefined && defaultParams !== null) {
    assertChannelCorrect(
      "updateRoute",
      name,
      defaultParams,
      queryParamsOf(store, name),
      "this route's `defaultParams`",
      "Move it to `defaultSearch`",
    );
  }

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
    if (objectKeys(nextCustomFields).length > 0) {
      store.routeCustomFields[name] = nextCustomFields;
    } else {
      delete store.routeCustomFields[name];
    }
  }

  if (forwardToPlan !== undefined) {
    store.config.forwardMap = forwardToPlan.forwardMap;
    store.config.forwardFnMap = forwardToPlan.forwardFnMap;
    adoptForwardState(store, forwardToPlan.resolved);
  }

  commitScalarConfig(store, name, {
    defaultParams,
    defaultSearch,
    decodeParams,
    encodeParams,
  });

  // Install the guards from their PREPARE-phase precompiled functions; a `null`
  // clears the definition-origin guard only (#952). See commitGuardUpdate.
  commitGuardUpdate(lifecycle, "activate", name, canActivate, activateFn);
  commitGuardUpdate(lifecycle, "deactivate", name, canDeactivate, deactivateFn);

  return {
    forwardTo,
    defaultParams,
    defaultSearch,
    decodeParams,
    encodeParams,
  };
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
    objectCreate(null) as RouteConfig["forwardMap"],
    config.forwardMap,
  );
  const forwardFnMap = Object.assign(
    objectCreate(null) as RouteConfig["forwardFnMap"],
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

  for (const key of objectKeys(updates)) {
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
      // ⚑ A plain `next[key] = value` dispatched into whatever the chain
      // carries under this name. For the literal `"__proto__"` that is the
      // inherited SETTER, so an object value swapped the prototype of the record
      // about to be STORED — and `getRouteConfig` hands that record to plugins,
      // which read it by key (`config?.[hookName]`, `config?.preload`). An
      // injected function was therefore compiled and invoked as a lifecycle hook
      // or a preload factory; a non-object value was silently dropped, because
      // the setter ignores it (#1788).
      //
      // ⚠ That was fixed by special-casing the literal alone, on the
      // reasoning that `constructor` / `toString` and friends are plain data
      // properties which land correctly through assignment. True of
      // `Object.prototype`'s OWN twelve members, and not the hazard (#1852):
      // the key here is a CUSTOM FIELD NAME from the caller's patch, and an
      // application that defines an accessor under that name turns the
      // assignment into a call into its own code. Measured through
      // `update("home", { zzHaz: 42 })` with such an accessor, the getter+setter
      // shape was the bad one — no throw at all, `update()` reported success,
      // the value went to the foreign setter, and the field vanished; on a route
      // with no other custom field the record emptied and `getRouteConfig`
      // answered `undefined`.
      //
      // `putField` covers every name, and it also restores the agreement with
      // REGISTRATION this comment already cared about: `fromEntries` there
      // DEFINES for every key, so `add` was immune on this axis while `update`
      // was not.
      putField(next, key, value);
    }
  }

  return next;
}

/**
 * Applies one nullable scalar-config update in place: `undefined` is a no-op
 * (field not in the patch), `null` deletes the entry, any other value sets it.
 */
function commitScalarField<T>(
  map: Record<string, T>,
  name: string,
  value: T | null | undefined,
): void {
  if (value === undefined) {
    return;
  }

  if (value === null) {
    delete map[name];
  } else {
    map[name] = value;
  }
}

/**
 * COMMIT step for the scalar config fields of an update (#951): writes
 * `defaultParams` / `defaultSearch` / `decodeParams` / `encodeParams` in place.
 * These assignments
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
    defaultSearch?: SearchParams | null | undefined;
    decodeParams?:
      ((channels: ParamsSearch) => ParamsSearch) | null | undefined;
    encodeParams?:
      ((channels: ParamsSearch) => ParamsSearch) | null | undefined;
  },
): void {
  commitScalarField(store.config.defaultParams, name, updates.defaultParams);
  commitScalarField(store.config.defaultSearch, name, updates.defaultSearch);

  if (updates.decodeParams !== undefined) {
    if (updates.decodeParams === null) {
      delete store.config.decoders[name];
    } else {
      const decoder = updates.decodeParams;

      store.config.decoders[name] = (channels: ParamsSearch): ParamsSearch =>
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime fallback if user-provided decoder violates its `{ params, search }` return type
        decoder(channels) ?? channels;
    }
  }

  if (updates.encodeParams !== undefined) {
    if (updates.encodeParams === null) {
      delete store.config.encoders[name];
    } else {
      const encoder = updates.encodeParams;

      store.config.encoders[name] = (channels: ParamsSearch): ParamsSearch =>
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime fallback if user-provided encoder violates its `{ params, search }` return type
        encoder(channels) ?? channels;
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
  matcherOptions: CreateMatcherOptions | undefined,
  logger: RouterLogger,
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
  // One read per own key (#1899) — the third and last
  // population entry point, same reason as `add` / `replace`.
  const batch = snapshotRouteBatch(routes);

  assertNoInternalNamesInBatch(batch, "addRoute");
  assertNonEmptyNamesInBatch(batch, "constructor");
  assertNoDottedNamesInBatch(batch, "constructor");
  assertNoDuplicateNamesInBatch(batch, "", "addRoute");

  const artifacts = buildReplaceArtifacts(batch, "", matcherOptions, logger);

  const store: RoutesStore<Dependencies> = {
    // Deferred access: the getter runs only after `store` is initialized.
    get definitions() {
      return routeTreeToDefinitions(store.tree);
    },
    config: artifacts.config,
    tree: artifacts.tree,
    matcher: artifacts.matcher,
    urlParamsCache: new Map(),
    queryParamsCache: new Map(),
    resolvedForwardMap: artifacts.resolvedForwardMap,
    hasAnyForward: anyForwardConfigured(artifacts.config),
    routeCustomFields: artifacts.routeCustomFields,
    rootPath: "",
    matcherOptions,
    depsStore: undefined,
    lifecycleNamespace: undefined,
    pendingCanActivate: artifacts.pendingCanActivate,
    pendingCanDeactivate: artifacts.pendingCanDeactivate,
  };

  // Same config-time channel check the add/replace path runs, so the
  // constructor is not the one population entry point that accepts a config
  // whose own state the router would then reject on `start()`.
  assertRouteDefaultChannelsFor(store.matcher, store.config, "addRoute");

  // ⚑ The SLOT, not only what it holds. `matcherOptions` is a frozen snapshot
  // precisely because it is reachable from outside core — `routeGetStore()` is
  // on the `RouterInternals` contract, published at
  // `@real-router/core/validation` — but freezing the object left the property
  // that HOLDS it plain writable. Measured: replacing it wholesale was accepted
  // and `dispose()` then threw the named config error, i.e. the #1796 defect
  // reproduced verbatim through the very surface the freeze cites as its reason.
  // Nothing assigns this slot at runtime; the matcher is rebuilt around it.
  //
  // ⚠ State the level you closed, and only that one. This shape repeated three
  // times on the way here — snapshot, container, slot — and it does NOT stop
  // here: `routeGetStore()` hands out fifteen slots, of which EIGHT are
  // destructive when replaced (`matcher`, `tree`, `config`, both caches,
  // `rootPath`, `depsStore`, `lifecycleNamespace`). Only this one is sealed,
  // because only this one was made load-bearing by the snapshot work; the others
  // corrupt loudly or silently on their own terms. Whether the store should be
  // handed to plugins writable at all is the larger question, tracked separately.
  //
  // ⚠ `writable: false` only THROWS in strict mode. A sloppy-mode consumer's
  // write is silently ignored instead — the value is still protected, the
  // signal is not.
  defineProperty(store, "matcherOptions", {
    writable: false,
    configurable: false,
  });

  return store;
}
