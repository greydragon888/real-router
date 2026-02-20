// packages/core/src/namespaces/RoutesNamespace/helpers.ts

import { getSegmentsByName } from "route-tree";
import { getTypeDescription } from "type-guards";

import type { RouteConfig } from "./types";
import type { Route } from "../../types";
import type {
  DefaultDependencies,
  ForwardToCallback,
  Params,
} from "@real-router/types";
import type { RouteDefinition, RouteTree } from "route-tree";

/**
 * Creates an empty RouteConfig.
 */
export function createEmptyConfig(): RouteConfig {
  return {
    decoders: Object.create(null) as Record<string, (params: Params) => Params>,
    encoders: Object.create(null) as Record<string, (params: Params) => Params>,
    defaultParams: Object.create(null) as Record<string, Params>,
    forwardMap: Object.create(null) as Record<string, string>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    forwardFnMap: Object.create(null) as Record<string, ForwardToCallback<any>>,
  };
}

// ============================================================================
// Route Tree Helpers
// ============================================================================

/**
 * Checks if all params from source exist with same values in target.
 * Small function body allows V8 inlining.
 */
export function paramsMatch(source: Params, target: Params): boolean {
  for (const key in source) {
    if (source[key] !== target[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Checks params match, skipping keys present in skipKeys.
 */
export function paramsMatchExcluding(
  source: Params,
  target: Params,
  skipKeys: Params,
): boolean {
  for (const key in source) {
    if (key in skipKeys) {
      continue;
    }
    if (source[key] !== target[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Sanitizes a route by keeping only essential properties.
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
 * Clears configuration entries that match the predicate.
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
// Route Property Validation
// ============================================================================

/**
 * Validates forwardTo property type and async status.
 */
function validateForwardToProperty(forwardTo: unknown, fullName: string): void {
  if (forwardTo === undefined) {
    return;
  }

  if (typeof forwardTo === "function") {
    const isNativeAsync =
      (forwardTo as { constructor: { name: string } }).constructor.name ===
      "AsyncFunction";
    const isTranspiledAsync = forwardTo.toString().includes("__awaiter");

    if (isNativeAsync || isTranspiledAsync) {
      throw new TypeError(
        `[router.addRoute] forwardTo callback cannot be async for route "${fullName}". ` +
          `Async functions break matchPath/buildPath.`,
      );
    }
  }
}

/**
 * Validates route properties for addRoute.
 * Throws TypeError if any property is invalid.
 *
 * @param route - Route to validate
 * @param fullName - Full route name (with parent prefix)
 * @throws {TypeError} If canActivate/canDeactivate is not a function
 * @throws {TypeError} If defaultParams is not a plain object
 * @throws {TypeError} If decodeParams/encodeParams is async
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
  if (route.decodeParams?.constructor.name === "AsyncFunction") {
    throw new TypeError(
      `[router.addRoute] decodeParams cannot be async for route "${fullName}". Async functions break matchPath/buildPath.`,
    );
  }

  // Validate encodeParams is not async (sync required for matchPath/buildPath)
  if (route.encodeParams?.constructor.name === "AsyncFunction") {
    throw new TypeError(
      `[router.addRoute] encodeParams cannot be async for route "${fullName}". Async functions break matchPath/buildPath.`,
    );
  }

  // Validate forwardTo type and async
  validateForwardToProperty(route.forwardTo, fullName);

  // Recursively validate children
  if (route.children) {
    for (const child of route.children) {
      const childFullName = `${fullName}.${child.name}`;

      validateRouteProperties(child, childFullName);
    }
  }
}

// ============================================================================
// ForwardTo Validation
// ============================================================================

/**
 * Extracts parameter names from a path string.
 * Matches :param and *splat patterns.
 */
function extractParamsFromPath(path: string): Set<string> {
  const params = new Set<string>();
  const paramRegex = /[*:]([A-Z_a-z]\w*)/g;
  let match;

  while ((match = paramRegex.exec(path)) !== null) {
    params.add(match[1]);
  }

  return params;
}

/**
 * Extracts all parameters from multiple path segments.
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
 * Collects all path segments for a route from batch definitions.
 * Traverses parent routes to include inherited path segments.
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

  /* v8 ignore next -- @preserve unreachable: callers validate existence */
  throw new Error(
    `[internal] collectPathsToRoute: route "${routeName}" not found`,
  );
}

/**
 * Collects all route names from a batch of routes (including children).
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
 * Only collects string forwardTo values; callbacks are handled separately.
 */
function collectForwardMappings<Dependencies extends DefaultDependencies>(
  routes: readonly Route<Dependencies>[],
  parentName = "",
): Map<string, string> {
  const mappings = new Map<string, string>();

  for (const route of routes) {
    const fullName = parentName ? `${parentName}.${route.name}` : route.name;

    if (route.forwardTo && typeof route.forwardTo === "string") {
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
 * Extracts required path parameters from route segments.
 */
function getRequiredParams(segments: readonly RouteTree[]): Set<string> {
  const params = new Set<string>();

  for (const segment of segments) {
    // Named routes always have parsers (null only for root without path)
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
 * Checks if a route exists in the tree by navigating through children Map.
 */
function routeExistsInTree(tree: RouteTree, routeName: string): boolean {
  const segments = routeName.split(".");
  let current: RouteTree | undefined = tree;

  for (const segment of segments) {
    current = current.children.get(segment);

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
 * Resolves a forwardTo chain to its final destination.
 * Detects cycles and enforces max depth.
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

    if (visited.has(next)) {
      const cycleStart = chain.indexOf(next);
      const cycle = [...chain.slice(cycleStart), next];

      throw new Error(`Circular forwardTo: ${cycle.join(" → ")}`);
    }

    visited.add(current);
    chain.push(next);
    current = next;

    if (chain.length > maxDepth) {
      throw new Error(
        `forwardTo chain exceeds maximum depth (${maxDepth}): ${chain.join(" → ")}`,
      );
    }
  }

  return current;
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
