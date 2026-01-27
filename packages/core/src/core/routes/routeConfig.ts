// packages/real-router/modules/core/routes/routeConfig.ts

import { logger } from "@real-router/logger";
import { getSegmentsByName } from "route-tree";
import { isParams, getTypeDescription } from "type-guards";

import { getConfig, setResolvedForwardMap } from "../../internals";

import type {
  ActivationFnFactory,
  Config,
  DefaultDependencies,
  Params,
  Route,
  Router,
} from "@real-router/types";
import type { RouteDefinition, RouteTree } from "route-tree";

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validates parameters object structure.
 *
 * @param params - Parameters to validate
 * @param methodName - Calling method for error context
 * @throws {TypeError} If params structure is invalid
 */
export function validateParams(
  params: unknown,
  methodName: string,
): asserts params is Params {
  if (!isParams(params)) {
    throw new TypeError(
      `[router.${methodName}] Invalid params structure: ${getTypeDescription(params)}`,
    );
  }
}

/**
 * Validates route properties (canActivate, defaultParams) before registration.
 * This ensures type safety at configuration time, not runtime.
 *
 * @param route - Route to validate
 * @param fullName - Full route name (with parent prefix)
 * @throws {TypeError} If canActivate is not a function
 * @throws {TypeError} If defaultParams is not a plain object
 */
export function validateRouteProperties<
  Dependencies extends DefaultDependencies,
>(route: Route<Dependencies>, fullName: string): void {
  // Validate canActivate is a function
  if (
    route.canActivate !== undefined &&
    typeof route.canActivate !== "function"
  ) {
    throw new TypeError(
      `[router.addRoute] canActivate must be a function for route "${fullName}", ` +
        `got ${getTypeDescription(route.canActivate)}`,
    );
  }

  // Validate canDeactivate is a function
  if (
    route.canDeactivate !== undefined &&
    typeof route.canDeactivate !== "function"
  ) {
    throw new TypeError(
      `[router.addRoute] canDeactivate must be a function for route "${fullName}", ` +
        `got ${getTypeDescription(route.canDeactivate)}`,
    );
  }

  // Validate defaultParams is a plain object
  // Runtime check for invalid types passed via `as any`
  if (route.defaultParams !== undefined) {
    const params: unknown = route.defaultParams;

    if (
      params === null ||
      typeof params !== "object" ||
      Array.isArray(params)
    ) {
      throw new TypeError(
        `[router.addRoute] defaultParams must be an object for route "${fullName}", ` +
          `got ${getTypeDescription(route.defaultParams)}`,
      );
    }
  }

  // Validate decodeParams is not async (sync required for matchPath/buildPath)
  if (
    route.decodeParams !== undefined &&
    route.decodeParams.constructor.name === "AsyncFunction"
  ) {
    throw new TypeError(
      `[router.addRoute] decodeParams cannot be async for route "${fullName}". Async functions break matchPath/buildPath.`,
    );
  }

  // Validate encodeParams is not async (sync required for matchPath/buildPath)
  if (
    route.encodeParams !== undefined &&
    route.encodeParams.constructor.name === "AsyncFunction"
  ) {
    throw new TypeError(
      `[router.addRoute] encodeParams cannot be async for route "${fullName}". Async functions break matchPath/buildPath.`,
    );
  }

  // Recursively validate children
  if (route.children) {
    for (const child of route.children) {
      const childFullName = `${fullName}.${child.name}`;

      validateRouteProperties(child, childFullName);
    }
  }
}

// ============================================================================
// Parameter Extraction Helpers
// ============================================================================

/**
 * Extracts required path parameters from route segments.
 * Required params are urlParams and spatParams (not queryParams).
 *
 * Note: getSegmentsByName only returns segments with parsers,
 * so we can safely use non-null assertion here.
 *
 * @param segments - Route segments from getSegmentsByName
 * @returns Set of required parameter names
 */
export function getRequiredParams(segments: readonly RouteTree[]): Set<string> {
  const params = new Set<string>();

  for (const segment of segments) {
    // getSegmentsByName only includes segments with parsers
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const parser = segment.parser!;

    for (const param of parser.urlParams) {
      params.add(param);
    }

    for (const param of parser.spatParams) {
      params.add(param);
    }
  }

  return params;
}

/**
 * Extracts parameter names from a path string.
 * Matches :param and *splat patterns.
 *
 * @param path - Route path string
 * @returns Set of parameter names
 */
function extractParamsFromPath(path: string): Set<string> {
  const params = new Set<string>();
  // Match :param and *splat patterns
  const paramRegex = /[*:]([A-Z_a-z]\w*)/g;
  let match;

  while ((match = paramRegex.exec(path)) !== null) {
    params.add(match[1]);
  }

  return params;
}

/**
 * Collects all path segments for a route from batch definitions.
 * Traverses parent routes to include inherited path segments.
 *
 * @remarks Callers must guarantee routeName exists in routes.
 *
 * @param routes - Batch of routes to search
 * @param routeName - Full route name to find (must exist in routes)
 * @param parentName - Current parent name prefix
 * @param paths - Accumulated path segments
 * @returns Array of path strings
 */
function collectPathsToRoute<Dependencies extends DefaultDependencies>(
  routes: readonly Route<Dependencies>[],
  routeName: string,
  parentName = "",
  paths: string[] = [],
): string[] {
  for (const route of routes) {
    const fullName = parentName ? `${parentName}.${route.name}` : route.name;
    const currentPaths = [...paths, route.path];

    if (fullName === routeName) {
      return currentPaths;
    }

    if (route.children && routeName.startsWith(`${fullName}.`)) {
      return collectPathsToRoute(
        route.children,
        routeName,
        fullName,
        currentPaths,
      );
    }
  }

  /* v8 ignore next -- @preserve unreachable: callers guarantee routeName exists in routes */
  return undefined as never;
}

/**
 * Extracts all parameters from multiple path segments.
 *
 * @param paths - Array of path strings
 * @returns Set of all parameter names
 */
function extractParamsFromPaths(paths: readonly string[]): Set<string> {
  const params = new Set<string>();

  for (const path of paths) {
    for (const param of extractParamsFromPath(path)) {
      params.add(param);
    }
  }

  return params;
}

/**
 * Collects all route names from a batch of routes (including children).
 *
 * @param routes - Routes to collect names from
 * @param parentName - Parent name prefix
 * @returns Set of all route names in the batch
 */
function collectRouteNames<Dependencies extends DefaultDependencies>(
  routes: readonly Route<Dependencies>[],
  parentName = "",
): Set<string> {
  const names = new Set<string>();

  for (const route of routes) {
    const fullName = parentName ? `${parentName}.${route.name}` : route.name;

    names.add(fullName);

    if (route.children) {
      for (const childName of collectRouteNames(route.children, fullName)) {
        names.add(childName);
      }
    }
  }

  return names;
}

/**
 * Collects all forwardTo mappings from a batch of routes (including children).
 *
 * @param routes - Routes to collect forwardTo from
 * @param parentName - Parent name prefix
 * @returns Map of source route name to target route name
 */
function collectForwardMappings<Dependencies extends DefaultDependencies>(
  routes: readonly Route<Dependencies>[],
  parentName = "",
): Map<string, string> {
  const mappings = new Map<string, string>();

  for (const route of routes) {
    const fullName = parentName ? `${parentName}.${route.name}` : route.name;

    if (route.forwardTo) {
      mappings.set(fullName, route.forwardTo);
    }

    if (route.children) {
      for (const [key, value] of collectForwardMappings(
        route.children,
        fullName,
      )) {
        mappings.set(key, value);
      }
    }
  }

  return mappings;
}

/**
 * Checks if a route exists in the tree by navigating through childrenByName.
 *
 * @param tree - Root node of the route tree
 * @param routeName - Full route name (e.g., "users.profile")
 * @returns true if route exists, false otherwise
 */
function routeExistsInTree(tree: RouteTree, routeName: string): boolean {
  const segments = routeName.split(".");
  let current: RouteTree | undefined = tree;

  for (const segment of segments) {
    current = current.childrenByName.get(segment);

    if (!current) {
      return false;
    }
  }

  return true;
}

/**
 * Gets the target route parameters for validation.
 */
function getTargetParams<Dependencies extends DefaultDependencies>(
  targetRoute: string,
  existsInTree: boolean,
  tree: RouteTree,
  routes: readonly Route<Dependencies>[],
): Set<string> {
  if (existsInTree) {
    const toSegments = getSegmentsByName(tree, targetRoute);

    // toSegments won't be null since we checked existsInTree
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return getRequiredParams(toSegments!);
  }

  // Target is in batch
  return extractParamsFromPaths(collectPathsToRoute(routes, targetRoute));
}

/**
 * Validates a single forward mapping for target existence and param compatibility.
 *
 * @throws {Error} If target doesn't exist or params are incompatible
 */
function validateSingleForward<Dependencies extends DefaultDependencies>(
  fromRoute: string,
  targetRoute: string,
  routes: readonly Route<Dependencies>[],
  batchNames: Set<string>,
  tree: RouteTree,
): void {
  const existsInTree = routeExistsInTree(tree, targetRoute);
  const existsInBatch = batchNames.has(targetRoute);

  if (!existsInTree && !existsInBatch) {
    throw new Error(
      `[router.addRoute] forwardTo target "${targetRoute}" does not exist ` +
        `for route "${fromRoute}"`,
    );
  }

  // Get source params
  const fromParams = extractParamsFromPaths(
    collectPathsToRoute(routes, fromRoute),
  );

  // Get target params
  const toParams = getTargetParams(targetRoute, existsInTree, tree, routes);

  // Check for missing params
  const missingParams = [...toParams].filter((p) => !fromParams.has(p));

  if (missingParams.length > 0) {
    throw new Error(
      `[router.addRoute] forwardTo target "${targetRoute}" requires params ` +
        `[${missingParams.join(", ")}] that are not available in source route "${fromRoute}"`,
    );
  }
}

/**
 * Validates forwardTo targets and cycles BEFORE any modifications.
 * This ensures atomicity - if validation fails, no routes are added.
 *
 * @param routes - Routes to validate
 * @param existingForwardMap - Current forwardMap from router.config
 * @param tree - Current route tree
 *
 * @throws {Error} If forwardTo target doesn't exist
 * @throws {Error} If circular forwardTo is detected
 */
export function validateForwardToTargets<
  Dependencies extends DefaultDependencies,
>(
  routes: readonly Route<Dependencies>[],
  existingForwardMap: Record<string, string>,
  tree: RouteTree,
): void {
  const batchNames = collectRouteNames(routes);
  const batchForwards = collectForwardMappings(routes);

  // Merge with existing forwardMap for cycle detection
  const combinedForwardMap: Record<string, string> = { ...existingForwardMap };

  for (const [from, to] of batchForwards) {
    combinedForwardMap[from] = to;
  }

  // Validate each forwardTo target exists and params are compatible
  for (const [fromRoute, targetRoute] of batchForwards) {
    validateSingleForward(fromRoute, targetRoute, routes, batchNames, tree);
  }

  // Check for cycles in the combined forwardMap
  for (const fromRoute of Object.keys(combinedForwardMap)) {
    resolveForwardChain(fromRoute, combinedForwardMap);
  }
}

/**
 * Registers route handlers (canActivate).
 *
 * @param route - Route configuration
 * @param router - Router instance
 */
export function registerRouteHandlers<Dependencies extends DefaultDependencies>(
  route: Route<Dependencies>,
  router: Router<Dependencies>,
): void {
  if (route.canActivate) {
    router.canActivate(route.name, route.canActivate);
  }
}

/**
 * Resolves a forwardTo chain to its final destination.
 *
 * Follows the chain of forwardTo references until reaching a route
 * that doesn't forward, or until detecting a cycle or reaching max depth.
 *
 * @param startRoute - Starting route name
 * @param forwardMap - Map of route forwards
 * @param maxDepth - Maximum chain depth (default: 100)
 * @returns Final destination route name
 * @throws {Error} If circular forwardTo is detected or chain exceeds max depth
 *
 * @example
 * ```typescript
 * // Simple chain: A → B → C
 * resolveForwardChain("A", { A: "B", B: "C" }) // → "C"
 *
 * // Cycle detected: A → B → A
 * resolveForwardChain("A", { A: "B", B: "A" }) // throws Error
 * ```
 */
export function resolveForwardChain(
  startRoute: string,
  forwardMap: Record<string, string>,
  maxDepth = 100,
): string {
  const visited = new Set<string>();
  const chain: string[] = [startRoute];
  let current = startRoute;

  while (forwardMap[current]) {
    const next = forwardMap[current];

    // Cycle detection: if we've seen this route before, it's a cycle
    if (visited.has(next)) {
      const cycleStart = chain.indexOf(next);
      const cycle = [...chain.slice(cycleStart), next];

      throw new Error(`Circular forwardTo: ${cycle.join(" → ")}`);
    }

    visited.add(current);
    chain.push(next);
    current = next;

    // Depth limit protection
    if (chain.length > maxDepth) {
      throw new Error(
        `forwardTo chain exceeds maximum depth (${maxDepth}): ${chain.join(" → ")}`,
      );
    }
  }

  return current;
}

/**
 * Validates and caches all forwardTo chains.
 *
 * This function:
 * 1. Validates that all forwardTo targets exist in the route tree
 * 2. Detects circular forwardTo references
 * 3. Resolves all chains to their final destinations
 * 4. Caches the resolved values for O(1) runtime lookup
 *
 * @param router - Router instance
 * @throws {Error} If a forwardTo target doesn't exist or a cycle is detected
 */
export function validateAndCacheForwardMap<
  Dependencies extends DefaultDependencies,
>(router: Router<Dependencies>): void {
  const { forwardMap } = getConfig(router);
  const resolvedMap: Record<string, string> = {};

  for (const fromRoute of Object.keys(forwardMap)) {
    // Resolve the full chain to cache the final destination
    // Note: cycles are caught in Phase 1 (validateForwardToTargets)
    resolvedMap[fromRoute] = resolveForwardChain(fromRoute, forwardMap);
  }

  // TODO(RFC-8): Replace with CacheManager.getInstance().setResolvedForwardMap(router, resolvedMap)
  setResolvedForwardMap(router, resolvedMap);
}

/**
 * Registers route forward configuration.
 *
 * IMPORTANT: forwardTo creates a URL alias, not a transition chain.
 * Guards (canActivate) on routes with forwardTo are NOT executed.
 * Only guards on the final destination are executed.
 *
 * This matches Vue Router and Angular Router behavior where
 * redirect routes bypass guards on the source.
 *
 * @param route - Route configuration
 * @param router - Router instance
 */
export function registerRouteForward<Dependencies extends DefaultDependencies>(
  route: Route<Dependencies>,
  router: Router<Dependencies>,
): void {
  if (route.forwardTo) {
    // Warn if route has both forwardTo and canActivate
    // canActivate will be ignored because forwardTo is an alias, not a transition
    if (route.canActivate) {
      logger.warn(
        "real-router",
        `Route "${route.name}" has both forwardTo and canActivate. ` +
          `canActivate will be ignored because forwardTo creates a redirect (industry standard). ` +
          `Move canActivate to the target route "${route.forwardTo}".`,
      );
    }

    getConfig(router).forwardMap[route.name] = route.forwardTo;
  }
}

/**
 * Registers route parameter decoders and encoders.
 *
 * @param route - Route configuration
 * @param router - Router instance
 */
export function registerRouteTransformers<
  Dependencies extends DefaultDependencies,
>(route: Route<Dependencies>, router: Router<Dependencies>): void {
  const config = getConfig(router);

  if (route.decodeParams) {
    config.decoders[route.name] = (params: Params): Params =>
      route.decodeParams?.(params) ?? params;
  }

  if (route.encodeParams) {
    config.encoders[route.name] = (params: Params): Params =>
      route.encodeParams?.(params) ?? params;
  }
}

/**
 * Registers route default parameters.
 *
 * @param route - Route configuration
 * @param router - Router instance
 */
export function registerRouteDefaults<Dependencies extends DefaultDependencies>(
  route: Route<Dependencies>,
  router: Router<Dependencies>,
): void {
  if (route.defaultParams) {
    getConfig(router).defaultParams[route.name] = route.defaultParams;
  }
}

/**
 * Recursively registers all route handlers from a route definition.
 */
export function registerAllRouteHandlers<
  Dependencies extends DefaultDependencies,
>(
  routes: readonly Route<Dependencies>[],
  router: Router<Dependencies>,
  parentName = "",
): void {
  for (const route of routes) {
    const fullName = parentName ? `${parentName}.${route.name}` : route.name;
    const routeWithFullName = { ...route, name: fullName };

    registerRouteHandlers(routeWithFullName, router);
    registerRouteForward(routeWithFullName, router);
    registerRouteTransformers(routeWithFullName, router);
    registerRouteDefaults(routeWithFullName, router);

    if (route.children) {
      registerAllRouteHandlers(route.children, router, fullName);
    }
  }
}

/**
 * Clears configuration entries that match the predicate.
 * Helper function for route removal operations.
 *
 * @param config - Configuration object to clean
 * @param matcher - Function to test if entry should be cleared
 */
export function clearConfigEntries<T>(
  config: Record<string, T>,
  matcher: (key: string) => boolean,
): void {
  for (const key of Object.keys(config)) {
    if (matcher(key)) {
      delete config[key];
    }
  }
}

// ============================================================================
// Route Tree Helpers
// ============================================================================

/**
 * Sanitizes a route by keeping only essential properties.
 * Custom properties (meta, permissions, etc.) are removed to optimize memory
 * and ensure a clean contract. Only name, path, and children are preserved.
 *
 * @param route - Route to sanitize
 * @returns Sanitized route definition
 */
export function sanitizeRoute<Dependencies extends DefaultDependencies>(
  route: Route<Dependencies>,
): RouteDefinition {
  const sanitized: RouteDefinition = {
    name: route.name,
    path: route.path,
  };

  if (route.children) {
    sanitized.children = route.children.map((child) => sanitizeRoute(child));
  }

  return sanitized;
}

/**
 * Recursively removes a route from definitions array.
 * Handles both top-level and nested routes.
 *
 * @param definitions - Route definitions array to modify
 * @param routeName - Full route name to remove
 * @param parentPrefix - Parent route prefix for recursion
 * @returns true if route was removed, false otherwise
 */
export function removeFromDefinitions(
  definitions: RouteDefinition[],
  routeName: string,
  parentPrefix = "",
): boolean {
  for (let i = 0; i < definitions.length; i++) {
    const route = definitions[i];
    const fullName = parentPrefix
      ? `${parentPrefix}.${route.name}`
      : route.name;

    if (fullName === routeName) {
      definitions.splice(i, 1);

      return true;
    }

    if (
      route.children &&
      routeName.startsWith(`${fullName}.`) &&
      removeFromDefinitions(route.children, routeName, fullName)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Updates or removes a config map entry.
 * - undefined: no change
 * - null: remove entry
 * - value: set entry
 *
 * @param map - Config map to modify
 * @param name - Route name key
 * @param value - Value to set, null to remove, undefined to skip
 */
export function updateConfigEntry<T>(
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

// ============================================================================
// Higher-Order Factory Functions
// ============================================================================

/**
 * Creates a function to clear all configurations associated with a route.
 * Includes config entries (decoders, encoders, defaults, forwards)
 * and lifecycle handlers (canActivate, canDeactivate).
 *
 * @param router - Router instance
 * @returns Function that clears configurations for a route name
 */
export function createClearRouteConfigurations<
  Dependencies extends DefaultDependencies,
>(router: Router<Dependencies>): (routeName: string) => void {
  return (routeName: string): void => {
    const shouldClear = (n: string): boolean =>
      n === routeName || n.startsWith(`${routeName}.`);

    const config = getConfig(router);

    // Clear config entries
    clearConfigEntries(config.decoders, shouldClear);
    clearConfigEntries(config.encoders, shouldClear);
    clearConfigEntries(config.defaultParams, shouldClear);
    clearConfigEntries(config.forwardMap, shouldClear);

    // Clear forwardMap entries pointing TO deleted route
    clearConfigEntries(config.forwardMap, (key) =>
      shouldClear(config.forwardMap[key]),
    );

    // Clear lifecycle handlers (silently - they may not exist)
    const [canDeactivateFactories, canActivateFactories] =
      router.getLifecycleFactories();

    for (const n of Object.keys(canActivateFactories)) {
      if (shouldClear(n)) {
        router.clearCanActivate(n, true);
      }
    }

    for (const n of Object.keys(canDeactivateFactories)) {
      if (shouldClear(n)) {
        router.clearCanDeactivate(n, true);
      }
    }
  };
}

/**
 * Creates a function to validate and apply forwardTo updates.
 *
 * @param forwardMap - Forward map from router config
 * @returns Function that validates and applies forwardTo
 * @throws {Error} If target doesn't exist, creates cycle, or params mismatch
 */
export function createApplyForwardToUpdate(
  forwardMap: Record<string, string>,
): (
  name: string,
  toRoute: string,
  segments: readonly RouteTree[],
  tree: RouteTree,
) => void {
  return (
    name: string,
    toRoute: string,
    segments: readonly RouteTree[],
    tree: RouteTree,
  ): void => {
    const toSegments = getSegmentsByName(tree, toRoute);

    if (!toSegments) {
      throw new Error(
        `[real-router] updateRoute: forwardTo target "${toRoute}" does not exist`,
      );
    }

    // Note: Self-reference cycles (name === toRoute) are caught by
    // resolveForwardChain() which runs before this function in updateRoute()

    const fromParams = getRequiredParams(segments);
    const toParams = getRequiredParams(toSegments);
    const missingParams = [...toParams].filter((p) => !fromParams.has(p));

    if (missingParams.length > 0) {
      throw new Error(
        `[real-router] updateRoute: forwardTo target "${toRoute}" requires params ` +
          `[${missingParams.join(", ")}] that are not available in source route "${name}"`,
      );
    }

    forwardMap[name] = toRoute;
  };
}

/**
 * Creates a function to enrich route definitions with config data.
 *
 * @param config - Router config containing forwardMap, decoders, encoders, defaultParams
 * @param canActivateFactories - Map of canActivate factories by route name
 * @returns Recursive function that enriches RouteDefinition to full Route
 */
export function createEnrichRoute<Dependencies extends DefaultDependencies>(
  config: Config,
  canActivateFactories: Record<string, ActivationFnFactory<Dependencies>>,
): (routeDef: RouteDefinition, routeName: string) => Route<Dependencies> {
  const enrichRoute = (
    routeDef: RouteDefinition,
    routeName: string,
  ): Route<Dependencies> => {
    const route: Route<Dependencies> = {
      name: routeDef.name,
      path: routeDef.path,
    };

    // Add forwardTo if exists
    const forwardTo = config.forwardMap[routeName];

    if (forwardTo) {
      route.forwardTo = forwardTo;
    }

    // Add defaultParams if exists
    if (routeName in config.defaultParams) {
      route.defaultParams = config.defaultParams[routeName];
    }

    // Add decoder if exists
    if (routeName in config.decoders) {
      route.decodeParams = config.decoders[routeName];
    }

    // Add encoder if exists
    if (routeName in config.encoders) {
      route.encodeParams = config.encoders[routeName];
    }

    // Add canActivate if exists
    if (routeName in canActivateFactories) {
      route.canActivate = canActivateFactories[routeName];
    }

    // Recursively enrich children
    if (routeDef.children) {
      route.children = routeDef.children.map((child) =>
        enrichRoute(child, `${routeName}.${child.name}`),
      );
    }

    return route;
  };

  return enrichRoute;
}
