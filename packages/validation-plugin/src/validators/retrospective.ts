// packages/validation-plugin/src/validators/retrospective.ts

import { resolveForwardChain as coreResolveForwardChain } from "@real-router/core";

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
  spatParams: readonly string[];
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

interface LocalRouteConfig {
  forwardMap: Record<string, string>;
  forwardFnMap: Record<string, unknown>;
  defaultParams: Record<string, unknown>;
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
  maxEventDepth: number;
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

    for (const param of segment.paramMeta.spatParams) {
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
 * Walks all route definitions, checks for duplicate names and invalid structure.
 * Adapted from: validateRoutes() in RoutesNamespace/validators.ts
 *
 * @param store - RoutesStore instance (typed as unknown to avoid core coupling)
 * @throws {TypeError} If store shape is invalid or definitions have structural issues
 * @throws {Error} If duplicate route names are detected
 */
export function validateExistingRoutes(store: unknown): void {
  const routesStore = assertRoutesStore(store, "validateExistingRoutes");
  const seenNames = new Set<string>();

  walkDefinitions(routesStore.definitions, (def, fullName) => {
    if (typeof def.name !== "string" || !def.name) {
      throw new TypeError(
        `[validation-plugin] validateExistingRoutes: route has invalid name: ${def.name}`,
      );
    }

    if (typeof def.path !== "string") {
      throw new TypeError(
        `[validation-plugin] validateExistingRoutes: route "${fullName}" has non-string path (${typeof def.path})`,
      );
    }

    if (seenNames.has(fullName)) {
      throw new Error(
        `[validation-plugin] validateExistingRoutes: duplicate route name detected: "${fullName}"`,
      );
    }

    seenNames.add(fullName);
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
  for (const [fromRoute, targetRoute] of Object.entries(config.forwardMap)) {
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
  for (const fromRoute of Object.keys(config.forwardMap)) {
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
export function validateRoutePropertiesStore(store: unknown): void {
  const routesStore = assertRoutesStore(store, "validateRoutePropertiesStore");
  const { config } = routesStore;

  // Validate decoders — must be non-async functions (sync required for matchPath/buildPath)
  for (const [routeName, decoder] of Object.entries(config.decoders)) {
    if (typeof decoder !== "function") {
      throw new TypeError(
        `[validation-plugin] validateRoutePropertiesStore: route "${routeName}" decoder must be a function, got ${typeof decoder}`,
      );
    }

    assertNotAsync(decoder, "decoder", routeName);
  }

  // Validate encoders — must be non-async functions (sync required for matchPath/buildPath)
  for (const [routeName, encoder] of Object.entries(config.encoders)) {
    if (typeof encoder !== "function") {
      throw new TypeError(
        `[validation-plugin] validateRoutePropertiesStore: route "${routeName}" encoder must be a function, got ${typeof encoder}`,
      );
    }

    assertNotAsync(encoder, "encoder", routeName);
  }

  // Validate defaultParams — must be plain objects (not null, array, or other types)
  for (const [routeName, params] of Object.entries(config.defaultParams)) {
    if (
      params === null ||
      typeof params !== "object" ||
      Array.isArray(params)
    ) {
      throw new TypeError(
        `[validation-plugin] validateRoutePropertiesStore: route "${routeName}" defaultParams must be a plain object, got ${Array.isArray(params) ? "array" : typeof params}`,
      );
    }
  }

  // Validate forwardTo function callbacks — must be non-async functions
  for (const [routeName, callback] of Object.entries(config.forwardFnMap)) {
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

  for (const [fromRoute, targetRoute] of Object.entries(config.forwardMap)) {
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
  for (const key of Object.keys(dependencies)) {
    if (Object.getOwnPropertyDescriptor(dependencies, key)?.get) {
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
    "maxEventDepth",
    "maxLifecycleHandlers",
  ];

  for (const key of expectedLimitKeys) {
    if (typeof limits[key] !== "number") {
      throw new TypeError(
        `[validation-plugin] validateDependenciesStructure: deps.limits.${key} must be a number, got ${typeof limits[key]}`,
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
 * Any route-level limit configured in options is also checked against definitions.
 * Adapted from: validateLimits() in OptionsNamespace/validators.ts
 *
 * @param options - Router options (typed as unknown to avoid core coupling)
 * @throws {RangeError} If dependency count reaches or exceeds maxDependencies limit
 * @throws {RangeError} If route count exceeds a configured maxRoutes limit in options
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

function checkRouteCountLimit(
  store: unknown,
  configuredLimits: Record<string, unknown>,
): void {
  if (!store || typeof store !== "object") {
    return;
  }

  const storeRecord = store as Record<string, unknown>;

  if (!Array.isArray(storeRecord.definitions)) {
    return;
  }

  const routeCount = (storeRecord.definitions as unknown[]).length;
  const maxRoutes = configuredLimits.maxRoutes;

  if (
    typeof maxRoutes === "number" &&
    maxRoutes > 0 &&
    routeCount > maxRoutes
  ) {
    throw new RangeError(
      `[validation-plugin] validateLimitsConsistency: route count (${routeCount}) exceeds configured limit (${maxRoutes})`,
    );
  }
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

  const depCount = Object.keys(dependencies).length;
  const limitsRecord = depsLimits as Record<string, unknown>;
  const maxDepsFromOptions = configuredLimits.maxDependencies;
  const maxDepsFromStore = limitsRecord.maxDependencies;
  const maxDeps =
    typeof maxDepsFromOptions === "number"
      ? maxDepsFromOptions
      : maxDepsFromStore;

  if (typeof maxDeps === "number" && maxDeps > 0 && depCount >= maxDeps) {
    throw new RangeError(
      `[validation-plugin] validateLimitsConsistency: dependency count (${depCount}) reaches or exceeds maxDependencies limit (${maxDeps})`,
    );
  }
}

export function validateLimitsConsistency(
  options: unknown,
  store: unknown,
  deps: unknown,
): void {
  const configuredLimits = extractConfiguredLimits(options);

  checkRouteCountLimit(store, configuredLimits);
  checkDepCountLimit(deps, configuredLimits);
}
