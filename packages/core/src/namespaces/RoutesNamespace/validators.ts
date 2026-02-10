// packages/core/src/namespaces/RoutesNamespace/validators.ts

/**
 * Static validation functions for RoutesNamespace.
 * Called by Router facade before instance methods.
 *
 * Extracted from RoutesNamespace class for better separation of concerns.
 */

import { validateRoute } from "route-tree";
import {
  isString,
  validateRouteName,
  isParams,
  getTypeDescription,
} from "type-guards";

import { validateRouteProperties, validateForwardToTargets } from "./helpers";

import type { Route, RouteConfigUpdate } from "../../types";
import type { DefaultDependencies } from "@real-router/types";
import type { RouteTree } from "route-tree";

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
 * Validates updateRoute property types using pre-cached values.
 * Called AFTER properties are cached to ensure getters are called only once.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- validation logic is naturally verbose
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

    // Async check for function forwardTo (both native and transpiled)
    if (
      typeof forwardTo === "function" &&
      ((forwardTo as { constructor: { name: string } }).constructor.name ===
        "AsyncFunction" ||
        (forwardTo as { toString: () => string })
          .toString()
          .includes("__awaiter"))
    ) {
      throw new TypeError(
        `[real-router] updateRoute: forwardTo callback cannot be async`,
      );
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

  // Validate decodeParams
  if (decodeParams !== undefined && decodeParams !== null) {
    if (typeof decodeParams !== "function") {
      throw new TypeError(
        `[real-router] updateRoute: decodeParams must be a function or null, got ${typeof decodeParams}`,
      );
    }

    // Check for async function
    if (
      (decodeParams as { constructor: { name: string } }).constructor.name ===
        "AsyncFunction" ||
      (decodeParams as { toString: () => string })
        .toString()
        .includes("__awaiter")
    ) {
      throw new TypeError(
        `[real-router] updateRoute: decodeParams cannot be an async function`,
      );
    }
  }

  // Validate encodeParams
  if (encodeParams !== undefined && encodeParams !== null) {
    if (typeof encodeParams !== "function") {
      throw new TypeError(
        `[real-router] updateRoute: encodeParams must be a function or null, got ${typeof encodeParams}`,
      );
    }

    // Check for async function
    if (
      (encodeParams as { constructor: { name: string } }).constructor.name ===
        "AsyncFunction" ||
      (encodeParams as { toString: () => string })
        .toString()
        .includes("__awaiter")
    ) {
      throw new TypeError(
        `[real-router] updateRoute: encodeParams cannot be an async function`,
      );
    }
  }
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
 * Checks for duplicates, parent existence, and forwardTo targets/cycles.
 *
 * @param routes - Routes to validate
 * @param tree - Current route tree (optional for initial validation)
 * @param forwardMap - Current forward map for cycle detection
 */
export function validateRoutes<Dependencies extends DefaultDependencies>(
  routes: Route<Dependencies>[],
  tree?: RouteTree,
  forwardMap?: Record<string, string>,
): void {
  // Tracking sets for duplicate detection
  const seenNames = new Set<string>();
  const seenPathsByParent = new Map<string, Set<string>>();

  for (const route of routes) {
    // Use route-tree's validateRoute for structural validation
    // (type, name, path, duplicates, parent exists, children array)
    // Note: validateRoute handles children recursively
    // When tree is undefined, only batch validation is performed (initial routes)
    validateRoute(route, "addRoute", tree, "", seenNames, seenPathsByParent);
  }

  // Validate forwardTo targets and cycles (only when tree is available)
  if (tree && forwardMap) {
    validateForwardToTargets(routes, forwardMap, tree);
  }
}
