// packages/core/src/namespaces/RoutesNamespace/validators.ts

/**
 * Static validation functions for RoutesNamespace.
 * Called by Router facade before instance methods.
 *
 * Extracted from RoutesNamespace class for better separation of concerns.
 */

import { logger } from "@real-router/logger";
import { validateRoute } from "route-tree";
import {
  isString,
  validateRouteName,
  isParams,
  getTypeDescription,
} from "type-guards";

import {
  resolveForwardChain,
  validateForwardToTargets,
  validateRouteProperties,
} from "./forwardToValidation";

import type { RouteConfig } from "./types";
import type { Route, RouteConfigUpdate } from "../../types";
import type {
  DefaultDependencies,
  ForwardToCallback,
} from "@real-router/types";
import type { Matcher, RouteTree } from "route-tree";

/**
 * Validates removeRoute arguments.
 */
export function validateRemoveRouteArgs(name: unknown): asserts name is string {
  validateRouteName(name, "removeRoute");
}

/**
 * Validates setRootPath arguments.
 */
export function validateSetRootPathArgs(
  rootPath: unknown,
): asserts rootPath is string {
  if (typeof rootPath !== "string") {
    throw new TypeError(
      `[router.setRootPath] rootPath must be a string, got ${getTypeDescription(rootPath)}`,
    );
  }
}

/**
 * Validates addRoute arguments (route structure and properties).
 * State-dependent validation (duplicates, tree) happens in instance method.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any Route type
export function validateAddRouteArgs(routes: readonly Route<any>[]): void {
  for (const route of routes) {
    // First check if route is an object (before accessing route.name)
    // Runtime check for invalid types passed via `as any`
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime check
    if (route === null || typeof route !== "object" || Array.isArray(route)) {
      throw new TypeError(
        `[router.addRoute] Route must be an object, got ${getTypeDescription(route)}`,
      );
    }

    // Validate route properties (canActivate, canDeactivate, defaultParams, async checks)
    // Note: validateRouteProperties handles children recursively
    validateRouteProperties(route, route.name);
  }
}

/**
 * Validates parent option for addRoute.
 */
export function validateParentOption(
  parent: unknown,
): asserts parent is string {
  if (typeof parent !== "string" || parent === "") {
    throw new TypeError(
      `[router.addRoute] parent option must be a non-empty string, got ${getTypeDescription(parent)}`,
    );
  }

  // Validate parent is a valid route name format (can contain dots — it's a fullName reference)
  validateRouteName(parent, "addRoute");
}

/**
 * Validates isActiveRoute arguments.
 */
export function validateIsActiveRouteArgs(
  name: unknown,
  params: unknown,
  strictEquality: unknown,
  ignoreQueryParams: unknown,
): void {
  // Validate name - non-string throws
  if (!isString(name)) {
    throw new TypeError(`Route name must be a string`);
  }

  // Validate params if provided
  if (params !== undefined && !isParams(params)) {
    throw new TypeError(`[router.isActiveRoute] Invalid params structure`);
  }

  // Validate strictEquality if provided
  if (strictEquality !== undefined && typeof strictEquality !== "boolean") {
    throw new TypeError(
      `[router.isActiveRoute] strictEquality must be a boolean, got ${typeof strictEquality}`,
    );
  }

  // Validate ignoreQueryParams if provided
  if (
    ignoreQueryParams !== undefined &&
    typeof ignoreQueryParams !== "boolean"
  ) {
    throw new TypeError(
      `[router.isActiveRoute] ignoreQueryParams must be a boolean, got ${typeof ignoreQueryParams}`,
    );
  }
}

/**
 * Validates forwardState/buildState arguments.
 */
export function validateStateBuilderArgs(
  routeName: unknown,
  routeParams: unknown,
  methodName: string,
): void {
  if (!isString(routeName)) {
    throw new TypeError(
      `[router.${methodName}] Invalid routeName: ${getTypeDescription(routeName)}. Expected string.`,
    );
  }

  if (!isParams(routeParams)) {
    throw new TypeError(
      `[router.${methodName}] Invalid routeParams: ${getTypeDescription(routeParams)}. Expected plain object.`,
    );
  }
}

/**
 * Validates updateRoute basic arguments (name and updates object structure).
 * Does NOT read property values to allow caller to cache them first.
 */
export function validateUpdateRouteBasicArgs<
  Dependencies extends DefaultDependencies,
>(
  name: unknown,
  updates: unknown,
): asserts updates is RouteConfigUpdate<Dependencies> {
  // Validate name
  validateRouteName(name, "updateRoute");

  if (name === "") {
    throw new ReferenceError(
      `[router.updateRoute] Invalid name: empty string. Cannot update root node.`,
    );
  }

  // Validate updates is not null

  if (updates === null) {
    throw new TypeError(
      `[real-router] updateRoute: updates must be an object, got null`,
    );
  }

  // Validate updates is an object (not array)
  if (typeof updates !== "object" || Array.isArray(updates)) {
    throw new TypeError(
      `[real-router] updateRoute: updates must be an object, got ${getTypeDescription(updates)}`,
    );
  }
}

/**
 * Asserts that a function is not async (native or transpiled).
 * Checks both constructor name and toString() for __awaiter pattern.
 */
/* v8 ignore next 12 -- @preserve: transpiled async (__awaiter) branch tested in addRoute */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- needs constructor.name access
function assertNotAsync(value: Function, paramName: string): void {
  if (
    (value as { constructor: { name: string } }).constructor.name ===
      "AsyncFunction" ||
    (value as { toString: () => string }).toString().includes("__awaiter")
  ) {
    throw new TypeError(
      `[real-router] updateRoute: ${paramName} cannot be an async function`,
    );
  }
}

/**
 * Validates that a value is a non-async function, if provided.
 */
function validateFunctionParam(value: unknown, paramName: string): void {
  if (value === undefined || value === null) {
    return;
  }

  if (typeof value !== "function") {
    throw new TypeError(
      `[real-router] updateRoute: ${paramName} must be a function or null, got ${typeof value}`,
    );
  }

  assertNotAsync(value, paramName);
}

/**
 * Validates updateRoute property types using pre-cached values.
 * Called AFTER properties are cached to ensure getters are called only once.
 */
export function validateUpdateRoutePropertyTypes(
  forwardTo: unknown,
  defaultParams: unknown,
  decodeParams: unknown,
  encodeParams: unknown,
): void {
  // Validate forwardTo type (existence check is done by instance method)
  if (forwardTo !== undefined && forwardTo !== null) {
    if (typeof forwardTo !== "string" && typeof forwardTo !== "function") {
      throw new TypeError(
        `[real-router] updateRoute: forwardTo must be a string, function, or null, got ${getTypeDescription(forwardTo)}`,
      );
    }

    if (typeof forwardTo === "function") {
      assertNotAsync(forwardTo, "forwardTo callback");
    }
  }

  // Validate defaultParams
  if (
    defaultParams !== undefined &&
    defaultParams !== null &&
    (typeof defaultParams !== "object" || Array.isArray(defaultParams))
  ) {
    throw new TypeError(
      `[real-router] updateRoute: defaultParams must be an object or null, got ${getTypeDescription(defaultParams)}`,
    );
  }

  validateFunctionParam(decodeParams, "decodeParams");
  validateFunctionParam(encodeParams, "encodeParams");
}

/**
 * Validates buildPath arguments.
 */
export function validateBuildPathArgs(route: unknown): asserts route is string {
  if (!isString(route) || route === "") {
    throw new TypeError(
      `[real-router] buildPath: route must be a non-empty string, got ${typeof route === "string" ? '""' : typeof route}`,
    );
  }
}

/**
 * Validates matchPath arguments.
 */
export function validateMatchPathArgs(path: unknown): asserts path is string {
  if (!isString(path)) {
    throw new TypeError(
      `[real-router] matchPath: path must be a string, got ${typeof path}`,
    );
  }
}

/**
 * Validates shouldUpdateNode arguments.
 */
export function validateShouldUpdateNodeArgs(
  nodeName: unknown,
): asserts nodeName is string {
  if (!isString(nodeName)) {
    throw new TypeError(
      `[router.shouldUpdateNode] nodeName must be a string, got ${typeof nodeName}`,
    );
  }
}

/**
 * Validates routes for addition to the router.
 * Checks parent existence, duplicates, and forwardTo targets/cycles.
 *
 * @param routes - Routes to validate
 * @param tree - Current route tree (optional for initial validation)
 * @param forwardMap - Current forward map for cycle detection
 * @param parentName - Optional parent route fullName for nesting via addRoute({ parent })
 */
export function validateRoutes<Dependencies extends DefaultDependencies>(
  routes: Route<Dependencies>[],
  tree?: RouteTree,
  forwardMap?: Record<string, string>,
  parentName?: string,
): void {
  // Validate parent route exists in tree
  if (parentName && tree) {
    let node: RouteTree | undefined = tree;

    for (const segment of parentName.split(".")) {
      node = node.children.get(segment);

      if (!node) {
        throw new Error(
          `[router.addRoute] Parent route "${parentName}" does not exist`,
        );
      }
    }
  }

  // Tracking sets for duplicate detection
  const seenNames = new Set<string>();
  const seenPathsByParent = new Map<string, Set<string>>();

  for (const route of routes) {
    validateRoute(
      route,
      "addRoute",
      tree,
      parentName ?? "",
      seenNames,
      seenPathsByParent,
    );
  }

  if (tree && forwardMap) {
    validateForwardToTargets(routes, forwardMap, tree);
  }
}

// ============================================================================
// Instance-level validators (moved from routesCrud.ts)
// ============================================================================

/**
 * Collects URL params from segments into a Set.
 */
function collectUrlParams(segments: readonly RouteTree[]): Set<string> {
  const params = new Set<string>();

  for (const segment of segments) {
    for (const param of segment.paramMeta.urlParams) {
      params.add(param);
    }
  }

  return params;
}

/**
 * Validates removeRoute constraints.
 * Returns false if removal should be blocked (route is active).
 * Logs warnings for edge cases.
 *
 * @param name - Route name to remove
 * @param currentStateName - Current active route name (or undefined)
 * @param isNavigating - Whether navigation is in progress
 * @returns true if removal can proceed, false if blocked
 */
export function validateRemoveRoute(
  name: string,
  currentStateName: string | undefined,
  isNavigating: boolean,
): boolean {
  // Check if trying to remove currently active route (or its parent)
  if (currentStateName) {
    const isExactMatch = currentStateName === name;
    const isParentOfCurrent = currentStateName.startsWith(`${name}.`);

    if (isExactMatch || isParentOfCurrent) {
      const suffix = isExactMatch ? "" : ` (current: "${currentStateName}")`;

      logger.warn(
        "router.removeRoute",
        `Cannot remove route "${name}" — it is currently active${suffix}. Navigate away first.`,
      );

      return false;
    }
  }

  // Warn if navigation is in progress (but allow removal)
  if (isNavigating) {
    logger.warn(
      "router.removeRoute",
      `Route "${name}" removed while navigation is in progress. This may cause unexpected behavior.`,
    );
  }

  return true;
}

/**
 * Validates clearRoutes operation.
 * Returns false if operation should be blocked (navigation in progress).
 *
 * @param isNavigating - Whether navigation is in progress
 * @returns true if clearRoutes can proceed, false if blocked
 */
export function validateClearRoutes(isNavigating: boolean): boolean {
  if (isNavigating) {
    logger.error(
      "router.clearRoutes",
      "Cannot clear routes while navigation is in progress. Wait for navigation to complete.",
    );

    return false;
  }

  return true;
}

/**
 * Validates that forwardTo target doesn't require params that source doesn't have.
 *
 * @param sourceName - Source route name
 * @param targetName - Target route name
 * @param matcher - Current route matcher
 */
export function validateForwardToParamCompatibility(
  sourceName: string,
  targetName: string,
  matcher: Matcher,
): void {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const sourceSegments = matcher.getSegmentsByName(
    sourceName,
  )! as readonly RouteTree[];
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const targetSegments = matcher.getSegmentsByName(
    targetName,
  )! as readonly RouteTree[];

  // Get source URL params as a Set for O(1) lookup
  const sourceParams = collectUrlParams(sourceSegments);

  // Build target URL params array (inline — no separate helper needed)
  const targetParams: string[] = [];

  for (const segment of targetSegments) {
    for (const param of segment.paramMeta.urlParams) {
      targetParams.push(param);
    }
  }

  // Check if target requires params that source doesn't have
  const missingParams = targetParams.filter(
    (param) => !sourceParams.has(param),
  );

  if (missingParams.length > 0) {
    throw new Error(
      `[real-router] forwardTo target "${targetName}" requires params ` +
        `[${missingParams.join(", ")}] that are not available in source route "${sourceName}"`,
    );
  }
}

/**
 * Validates that adding forwardTo doesn't create a cycle.
 * Creates a test map with the new entry and uses resolveForwardChain
 * to detect cycles before any mutation happens.
 *
 * @param sourceName - Source route name
 * @param targetName - Target route name
 * @param config - Current route config (forwardMap read-only in this call)
 */
export function validateForwardToCycle(
  sourceName: string,
  targetName: string,
  config: RouteConfig,
): void {
  // Create a test map with the new entry to validate BEFORE mutation
  const testMap = {
    ...config.forwardMap,
    [sourceName]: targetName,
  };

  // resolveForwardChain will throw if cycle is detected or max depth exceeded
  resolveForwardChain(sourceName, testMap);
}

/**
 * Validates updateRoute instance-level constraints (route existence, forwardTo).
 *
 * @param name - Route name (already validated by static method)
 * @param forwardTo - Cached forwardTo value
 * @param hasRoute - Function to check route existence
 * @param matcher - Current route matcher
 * @param config - Current route config
 */
export function validateUpdateRoute<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  name: string,
  forwardTo: string | ForwardToCallback<Dependencies> | null | undefined,
  hasRoute: (n: string) => boolean,
  matcher: Matcher,
  config: RouteConfig,
): void {
  // Validate route exists
  if (!hasRoute(name)) {
    throw new ReferenceError(
      `[real-router] updateRoute: route "${name}" does not exist`,
    );
  }

  // Validate forwardTo target exists and is valid (only for string forwardTo)
  if (
    forwardTo !== undefined &&
    forwardTo !== null &&
    typeof forwardTo === "string"
  ) {
    if (!hasRoute(forwardTo)) {
      throw new Error(
        `[real-router] updateRoute: forwardTo target "${forwardTo}" does not exist`,
      );
    }

    // Check forwardTo param compatibility
    validateForwardToParamCompatibility(name, forwardTo, matcher);

    // Check for cycle detection
    validateForwardToCycle(name, forwardTo, config);
  }
}
