// packages/validation-plugin/src/validators/retrospective.ts

import { resolveForwardChain as coreResolveForwardChain } from "@real-router/core";

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
const objectEntries = Object.entries;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectKeys = Object.keys;

/**
 * Retrospective validators — run AFTER the route tree is already built.
 * Called by the validation plugin at usePlugin() time, in a try/catch with rollback.
 *
 * The plugin is registered AFTER the constructor, so all routes are already in the store.
 * These functions receive store objects as parameters and cast internally using
 * local structural interfaces to avoid tight coupling to core internal types.
 *
 * All parameters are typed as `unknown` — cast internally as needed.
 */

// =============================================================================
// Local structural interfaces (cast-only, not imported from core internals)
// =============================================================================

interface LocalSegmentParamMeta {
  urlParams: readonly string[];
}

interface LocalRouteSegment {
  paramMeta: LocalSegmentParamMeta;
}

interface LocalRouteTree {
  children: Map<string, LocalRouteTree>;
  paramMeta: LocalSegmentParamMeta;
}

interface LocalRouteMatcher {
  getSegmentsByName: (
    name: string,
  ) => readonly LocalRouteSegment[] | null | undefined;
}

/**
 * The slots this pass reads off the store's `RouteConfig`.
 *
 * ⚠ A hand-written mirror, and it was short of core by one slot — `defaultSearch`
 * (#1787). That absence is why the loop below was never written: the field was
 * invisible here, so nothing pointed at the gap. Adding a slot to `RouteConfig`
 * in core does NOT red anything in this package; the coverage authority test is
 * what notices.
 */
interface LocalRouteConfig {
  forwardMap: Record<string, string>;
  forwardFnMap: Record<string, unknown>;
  defaultParams: Record<string, unknown>;
  defaultSearch: Record<string, unknown>;
  decoders: Record<string, unknown>;
  encoders: Record<string, unknown>;
}

interface LocalRouteDefinition {
  name: string;
  path: string;
  children?: LocalRouteDefinition[];
}

interface LocalRoutesStore {
  definitions: LocalRouteDefinition[];
  config: LocalRouteConfig;
  tree: LocalRouteTree;
  matcher: LocalRouteMatcher;
}

interface LocalDependencyLimits {
  maxDependencies: number;
  maxPlugins: number;
  maxListeners: number;
  warnListeners: number;
  maxLifecycleHandlers: number;
}

// =============================================================================
// Private helpers
// =============================================================================

function assertRoutesStore(store: unknown, fnName: string): LocalRoutesStore {
  if (!store || typeof store !== "object") {
    throw new TypeError(
      `[validation-plugin] ${fnName}: store must be an object`,
    );
  }

  const storeRecord = store as Record<string, unknown>;

  if (!Array.isArray(storeRecord.definitions)) {
    throw new TypeError(
      `[validation-plugin] ${fnName}: store.definitions must be an array`,
    );
  }

  if (!storeRecord.config || typeof storeRecord.config !== "object") {
    throw new TypeError(
      `[validation-plugin] ${fnName}: store.config must be an object`,
    );
  }

  if (!storeRecord.tree || typeof storeRecord.tree !== "object") {
    throw new TypeError(
      `[validation-plugin] ${fnName}: store.tree must be an object`,
    );
  }

  return storeRecord as unknown as LocalRoutesStore;
}

function walkDefinitions(
  definitions: LocalRouteDefinition[],
  callback: (def: LocalRouteDefinition, fullName: string) => void,
  parentName = "",
): void {
  for (const def of definitions) {
    const fullName = parentName ? `${parentName}.${def.name}` : def.name;

    callback(def, fullName);

    if (def.children) {
      walkDefinitions(def.children, callback, fullName);
    }
  }
}

function routeExistsInTree(tree: LocalRouteTree, routeName: string): boolean {
  const segments = routeName.split(".");
  let current: LocalRouteTree | undefined = tree;

  for (const segment of segments) {
    current = current.children.get(segment);

    if (!current) {
      return false;
    }
  }

  return true;
}

/**
 * Wraps core's resolveForwardChain with [validation-plugin] prefix on errors.
 * Core's version throws plain Error messages; retrospective validation
 * needs the [validation-plugin] prefix for consistency.
 */
function resolveForwardChainWithPrefix(
  startRoute: string,
  forwardMap: Record<string, string>,
): string {
  try {
    return coreResolveForwardChain(startRoute, forwardMap);
  } catch (error) {
    throw new Error(`[validation-plugin] ${(error as Error).message}`, {
      cause: error,
    });
  }
}

function collectUrlParams(segments: readonly LocalRouteSegment[]): Set<string> {
  const params = new Set<string>();

  for (const segment of segments) {
    for (const param of segment.paramMeta.urlParams) {
      params.add(param);
    }
  }

  return params;
}

/**
 * Asserts that a function value is not async (native or transpiled).
 * Adapted from: assertNotAsync() in RoutesNamespace/validators.ts
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- needs constructor.name access
function assertNotAsync(fn: Function, label: string, routeName: string): void {
  const function_ = fn as {
    constructor: { name: string };
    toString: () => string;
  };

  if (
    function_.constructor.name === "AsyncFunction" ||
    function_.toString().includes("__awaiter")
  ) {
    throw new TypeError(
      `[validation-plugin] Route "${routeName}" ${label} cannot be async`,
    );
  }
}

// =============================================================================
// 1. validateExistingRoutes
// =============================================================================

/**
 * Validates the existing route tree/definitions for structural integrity.
 * Walks all route definitions, checking each name and path shape.
 * Adapted from: validateRoutes() in RoutesNamespace/validators.ts
 *
 * Duplicate route names are intentionally NOT checked here. Bare core rejects a
 * duplicate name on every route-population entry point — `createRouter([...])`
 * initial routes (#1351), `add()` (within-batch #953 + the "already exists"
 * guard for cross-batch collisions), and `replace()` (#968) — so a built store
 * can never carry a duplicate for the retrospective pass to catch. Core is the
 * sole authority for the name-uniqueness invariant; mirroring it here was dead
 * code kept alive only by white-box unit tests (#1226).
 *
 * @param store - RoutesStore instance (typed as unknown to avoid core coupling)
 * @throws {TypeError} If store shape is invalid or definitions have structural issues
 */
export function validateExistingRoutes(store: unknown): void {
  const routesStore = assertRoutesStore(store, "validateExistingRoutes");

  walkDefinitions(routesStore.definitions, (def, fullName) => {
    if (typeof def.name !== "string" || !def.name) {
      throw new TypeError(
        `[validation-plugin] validateExistingRoutes: route has invalid name: ${def.name}`,
      );
    }

    // ⚑ The dotted-name check that #1194 added here is GONE, and its absence is
    // load-bearing rather than a cleanup. It closed a real hole: `add()` and
    // `replace()` rejected a dotted route name while the constructor did not, so
    // `createRouter([{ name: "a.c" }])` + this plugin slipped one past validation
    // into a name-vs-URL split-brain. #1763 moved the rule to where it belongs —
    // bare core now refuses the spelling at registration, with this exact
    // message — so `createRouter` throws before a plugin exists and nothing
    // dotted can reach this pass. It was unreachable code, not defence in depth:
    // `store.definitions` is derived from the TREE, whose nested children carry
    // bare names by construction.

    if (typeof def.path !== "string") {
      throw new TypeError(
        `[validation-plugin] validateExistingRoutes: route "${fullName}" has non-string path (${typeof def.path})`,
      );
    }
  });
}

// =============================================================================
// 2. validateForwardToConsistency
// =============================================================================

/**
 * Validates forwardTo consistency across all chains in the store.
 * Checks target existence, param compatibility, and circular chain detection.
 * Adapted from: validateForwardToTargets() in forwardToValidation.ts
 *
 * @param store - RoutesStore instance (typed as unknown to avoid core coupling)
 * @throws {Error} If any forwardTo target does not exist in the tree
 * @throws {Error} If param incompatibility is detected across a forwardTo pair
 * @throws {Error} If a circular forwardTo chain is detected
 */
export function validateForwardToConsistency(store: unknown): void {
  const routesStore = assertRoutesStore(store, "validateForwardToConsistency");
  const { config, tree, matcher } = routesStore;

  // Check target existence and param compatibility for each static mapping
  for (const [fromRoute, targetRoute] of objectEntries(config.forwardMap)) {
    if (!routeExistsInTree(tree, targetRoute)) {
      throw new Error(
        `[validation-plugin] validateForwardToConsistency: forwardTo target "${targetRoute}" ` +
          `does not exist in tree (source route: "${fromRoute}")`,
      );
    }

    // Validate param compatibility: target must not require params absent in source
    const sourceSegments = matcher.getSegmentsByName(fromRoute);
    const targetSegments = matcher.getSegmentsByName(targetRoute);

    if (sourceSegments && targetSegments) {
      const sourceParams = collectUrlParams(sourceSegments);
      const targetParams = collectUrlParams(targetSegments);
      const missingParams = [...targetParams].filter(
        (param) => !sourceParams.has(param),
      );

      if (missingParams.length > 0) {
        throw new Error(
          `[validation-plugin] validateForwardToConsistency: forwardTo target "${targetRoute}" ` +
            `requires params [${missingParams.join(", ")}] not available in source route "${fromRoute}"`,
        );
      }
    }
  }

  // Detect cycles in the full forwardMap (catches multi-hop cycles)
  for (const fromRoute of objectKeys(config.forwardMap)) {
    resolveForwardChainWithPrefix(fromRoute, config.forwardMap);
  }
}

// =============================================================================
// 3. validateRouteProperties
// =============================================================================

/**
 * Validates route properties for all registered routes in the store.
 * Checks decoder/encoder types, defaultParams structure, and async forwardTo callbacks.
 * Adapted from: validateRouteProperties() in forwardToValidation.ts
 *
 * @param store - RoutesStore instance (typed as unknown to avoid core coupling)
 * @throws {TypeError} If any registered decoder/encoder is not a valid sync function
 * @throws {TypeError} If any defaultParams is not a plain object
 * @throws {TypeError} If any forwardTo callback is async
 */
/** Every entry of a default-bag slot is a plain object, or the store is bad. */
function assertPlainBagSlot(
  slot: Record<string, unknown>,
  slotName: "defaultParams" | "defaultSearch",
): void {
  for (const [routeName, bag] of objectEntries(slot)) {
    if (bag === null || typeof bag !== "object" || Array.isArray(bag)) {
      throw new TypeError(
        `[validation-plugin] validateRoutePropertiesStore: route "${routeName}" ${slotName} must be a plain object, got ${Array.isArray(bag) ? "array" : typeof bag}`,
      );
    }
  }
}

export function validateRoutePropertiesStore(store: unknown): void {
  const routesStore = assertRoutesStore(store, "validateRoutePropertiesStore");
  const { config } = routesStore;

  // Validate decoders — must be non-async functions (sync required for matchPath/buildPath)
  for (const [routeName, decoder] of objectEntries(config.decoders)) {
    if (typeof decoder !== "function") {
      throw new TypeError(
        `[validation-plugin] validateRoutePropertiesStore: route "${routeName}" decoder must be a function, got ${typeof decoder}`,
      );
    }

    assertNotAsync(decoder, "decoder", routeName);
  }

  // Validate encoders — must be non-async functions (sync required for matchPath/buildPath)
  for (const [routeName, encoder] of objectEntries(config.encoders)) {
    if (typeof encoder !== "function") {
      throw new TypeError(
        `[validation-plugin] validateRoutePropertiesStore: route "${routeName}" encoder must be a function, got ${typeof encoder}`,
      );
    }

    assertNotAsync(encoder, "encoder", routeName);
  }

  // The two default bags carry the same rule, one slot apart (#1787).
  // ⚠ Reachable only for a TRUTHY value: core drops a falsy structural field
  // before anything is stored, so this pass has nothing left to read for one.
  // `structural-field-coverage-authority-1787` derives that boundary.
  assertPlainBagSlot(config.defaultParams, "defaultParams");
  assertPlainBagSlot(config.defaultSearch, "defaultSearch");

  // Validate forwardTo function callbacks — must be non-async functions
  for (const [routeName, callback] of objectEntries(config.forwardFnMap)) {
    if (typeof callback !== "function") {
      throw new TypeError(
        `[validation-plugin] validateRoutePropertiesStore: route "${routeName}" forwardTo callback must be a function, got ${typeof callback}`,
      );
    }

    assertNotAsync(callback, "forwardTo callback", routeName);
  }
}

// =============================================================================
// 4. validateForwardToTargets
// =============================================================================

/**
 * Validates that all static forwardTo targets exist in the route tree.
 * This is a focused existence-only check (param compat is in validateForwardToConsistency).
 * Adapted from: validateForwardToTargets() in forwardToValidation.ts
 *
 * @param store - RoutesStore instance (typed as unknown to avoid core coupling)
 * @throws {Error} If any forwardTo target route does not exist in the tree
 */
export function validateForwardToTargetsStore(store: unknown): void {
  const routesStore = assertRoutesStore(store, "validateForwardToTargetsStore");
  const { config, tree } = routesStore;

  for (const [fromRoute, targetRoute] of objectEntries(config.forwardMap)) {
    if (!routeExistsInTree(tree, targetRoute)) {
      throw new Error(
        `[validation-plugin] validateForwardToTargetsStore: forwardTo target "${targetRoute}" ` +
          `does not exist for route "${fromRoute}"`,
      );
    }
  }
}

// =============================================================================
// 5. validateDependenciesStructure
// =============================================================================

/**
 * Validates the full structure of the dependencies store.
 * Checks that the dependencies object is valid, has no getters, and limits are well-formed.
 * Adapted from: validateDependenciesObject() in DependenciesNamespace/validators.ts
 *
 * @param deps - DependenciesStore instance (typed as unknown to avoid core coupling)
 * @throws {TypeError} If deps is not an object
 * @throws {TypeError} If deps.dependencies is not a valid plain object (or has getters)
 * @throws {TypeError} If deps.limits is missing or has non-numeric limit values
 */
export function validateDependenciesStructure(deps: unknown): void {
  if (!deps || typeof deps !== "object") {
    throw new TypeError(
      "[validation-plugin] validateDependenciesStructure: deps must be an object",
    );
  }

  const depsRecord = deps as Record<string, unknown>;

  // Validate dependencies field exists and is an object
  if (!depsRecord.dependencies || typeof depsRecord.dependencies !== "object") {
    throw new TypeError(
      "[validation-plugin] validateDependenciesStructure: deps.dependencies must be an object",
    );
  }

  const dependencies = depsRecord.dependencies as Record<string, unknown>;

  // Getters can throw, return different values, or have side effects — reject them
  for (const key of objectKeys(dependencies)) {
    if (getOwnPropertyDescriptor(dependencies, key)?.get) {
      throw new TypeError(
        `[validation-plugin] validateDependenciesStructure: dependency "${key}" must not use a getter`,
      );
    }
  }

  // Validate limits field exists and is an object
  if (!depsRecord.limits || typeof depsRecord.limits !== "object") {
    throw new TypeError(
      "[validation-plugin] validateDependenciesStructure: deps.limits must be an object",
    );
  }

  const limits = depsRecord.limits as Record<string, unknown>;
  const expectedLimitKeys: (keyof LocalDependencyLimits)[] = [
    "maxDependencies",
    "maxPlugins",
    "maxListeners",
    "warnListeners",
    "maxLifecycleHandlers",
  ];

  for (const key of expectedLimitKeys) {
    // ⚑ `Number.isInteger`, not `typeof === "number"`. Core coerces the caller's
    // limits ONCE at construction (#1875), so by the time they reach this store
    // they are always `typeof "number"` — and `Number(undefined)`,
    // `Number("abc")` and `Number({})` are all `NaN`, which passes a `typeof`
    // test. A `typeof` check therefore stopped diagnosing the exact population
    // it was written for the moment the coercion moved upstream: measured,
    // `{ maxListeners: undefined }` was refused at install before that change
    // and installed clean after it. This also lands the check on the same
    // predicate `validateLimitValue` already uses, so the two mirrors agree.
    if (!Number.isInteger(limits[key])) {
      throw new TypeError(
        `[validation-plugin] validateDependenciesStructure: deps.limits.${key} must be an integer, got ${String(limits[key])}`,
      );
    }
  }
}

// =============================================================================
// 6. validateLimitsConsistency
// =============================================================================

/**
 * Validates that actual resource counts don't exceed configured limits.
 * Compares dependency count vs maxDependencies limit from the deps store.
 * Adapted from: validateLimits() in OptionsNamespace/validators.ts
 *
 * @param options - Router options (typed as unknown to avoid core coupling)
 * @throws {RangeError} If dependency count exceeds maxDependencies limit (#1225:
 *   `>` not `>=` — an at-limit store is legal, mirroring the live limiter)
 */
function extractConfiguredLimits(options: unknown): Record<string, unknown> {
  const opts =
    options && typeof options === "object"
      ? (options as Record<string, unknown>)
      : {};

  return opts.limits && typeof opts.limits === "object"
    ? (opts.limits as Record<string, unknown>)
    : {};
}

function checkDepCountLimit(
  deps: unknown,
  configuredLimits: Record<string, unknown>,
): void {
  if (!deps || typeof deps !== "object") {
    return;
  }

  const depsRecord = deps as Record<string, unknown>;
  const dependencies = depsRecord.dependencies;
  const depsLimits = depsRecord.limits;

  if (
    !dependencies ||
    typeof dependencies !== "object" ||
    !depsLimits ||
    typeof depsLimits !== "object"
  ) {
    return;
  }

  const depCount = objectKeys(dependencies).length;
  const limitsRecord = depsLimits as Record<string, unknown>;
  const maxDepsFromOptions = configuredLimits.maxDependencies;
  const maxDepsFromStore = limitsRecord.maxDependencies;
  const maxDeps =
    typeof maxDepsFromOptions === "number"
      ? maxDepsFromOptions
      : maxDepsFromStore;

  // `>`, not `>=` (#1225): the live limiter (`validateDependencyCount`) counts
  // BEFORE the insert, so a store may legally REACH exactly maxDependencies. This
  // retrospective pass checks committed STATE (re-run on usePlugin AND every
  // cloneRouter), so it must accept an at-limit store and reject only one that
  // STRICTLY exceeds the limit — else every SSR per-request clone of an at-limit
  // base throws.
  if (typeof maxDeps === "number" && maxDeps > 0 && depCount > maxDeps) {
    throw new RangeError(
      `[validation-plugin] validateLimitsConsistency: dependency count (${depCount}) exceeds maxDependencies limit (${maxDeps})`,
    );
  }
}

export function validateLimitsConsistency(
  options: unknown,
  deps: unknown,
): void {
  const configuredLimits = extractConfiguredLimits(options);

  checkDepCountLimit(deps, configuredLimits);
}

// =============================================================================
// 7. validateResolvedDefaultRoute
// =============================================================================

/**
 * Validates that a resolved defaultRoute name points to a route that exists
 * in the tree. Called at two places:
 *
 *   1. At plugin registration (retrospective) — with the static string value
 *      of options.defaultRoute, if any.
 *   2. At runtime inside resolveDefault() — with the return value of a
 *      DefaultRouteCallback, on every navigateToDefault(). (`start()` has no
 *      `defaultRoute` fallback — measured, it consults the option zero times.)
 *
 * No-op for empty string (means "no default configured" — handled upstream by
 * NavigationNamespace.navigateToDefault).
 */
export function validateResolvedDefaultRoute(
  routeName: unknown,
  store: unknown,
): void {
  if (typeof routeName !== "string" || !routeName) {
    return;
  }

  const routesStore = assertRoutesStore(store, "validateResolvedDefaultRoute");

  if (!routeExistsInTree(routesStore.tree, routeName)) {
    throw new Error(
      `[validation-plugin] defaultRoute resolved to non-existent route: "${routeName}"`,
    );
  }
}
