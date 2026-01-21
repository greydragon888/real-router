// packages/route-node/modules/validation/routes.ts

import type { RouteTree } from "../types";

/**
 * Creates a TypeError with consistent router error message format.
 *
 * @param methodName - Name of the method that triggered the error
 * @param message - Error message
 * @returns TypeError with formatted message
 * @internal
 */
function createRouterError(methodName: string, message: string): TypeError {
  return new TypeError(`[router.${methodName}] ${message}`);
}

/**
 * Validates route path format.
 * Throws a descriptive error if validation fails.
 *
 * Allows:
 * - Empty string (for grouping/root routes)
 * - Absolute paths: /path, ~path
 * - Query strings: ?query
 * - Relative segments: segment
 *
 * Prevents:
 * - Non-string values
 * - Double slashes (//)
 * - Absolute paths (~) under parameterized parent nodes
 *
 * @param path - Route path to validate
 * @param routeName - Name of route (for error messages)
 * @param methodName - Name of calling method for error messages
 * @param parentNode - Optional parent node for context validation
 * @throws {TypeError} If path is invalid
 *
 * @example
 * // Valid paths
 * validateRoutePath("", "home", "add");              // ok (empty for grouping)
 * validateRoutePath("/users", "users", "add");       // ok (absolute)
 * validateRoutePath("~dashboard", "dash", "add");    // ok (absolute, if no parameterized parent)
 * validateRoutePath("?tab=1", "home", "add");        // ok (query)
 * validateRoutePath("profile", "users.profile", "add"); // ok (relative)
 *
 * @example
 * // Invalid paths (throws)
 * validateRoutePath("/users//list", "users.list", "add");           // throws (double slash)
 * validateRoutePath("~dash", "dash", "add", paramParent);           // throws (~ under parameterized parent)
 */
export function validateRoutePath(
  path: unknown,
  routeName: string,
  methodName: string,
  parentNode?: RouteTree,
): asserts path is string {
  // Type check
  if (typeof path !== "string") {
    // Get type description for error message
    let typeDesc: string;

    if (path === null) {
      typeDesc = "null";
    } else if (Array.isArray(path)) {
      typeDesc = "array";
    } else {
      typeDesc = typeof path;
    }

    throw createRouterError(
      methodName,
      `Route path must be a string, got ${typeDesc}`,
    );
  }

  // Empty path is valid (for grouping/root)
  if (path === "") {
    return;
  }

  // No whitespace characters (spaces, tabs, newlines)
  if (/\s/.test(path)) {
    throw createRouterError(
      methodName,
      `Invalid path for route "${routeName}": whitespace not allowed in "${path}"`,
    );
  }

  // Valid path pattern
  if (!/^([/?~]|[^/]+$)/.test(path)) {
    throw createRouterError(
      methodName,
      `Route "${routeName}" has invalid path format: "${path}". Path should start with '/', '~', '?' or be a relative segment.`,
    );
  }

  // No double slashes
  if (path.includes("//")) {
    throw createRouterError(
      methodName,
      `Invalid path for route "${routeName}": double slashes not allowed in "${path}"`,
    );
  }

  // Absolute paths under parameterized parents
  // RouteTree has parser with urlParams array
  // Also support legacy hasUrlParams for backwards compatibility
  const hasUrlParams =
    parentNode?.parser &&
    (("urlParams" in parentNode.parser &&
      parentNode.parser.urlParams.length > 0) ||
      ("hasUrlParams" in parentNode.parser &&
        (parentNode.parser as { hasUrlParams?: boolean }).hasUrlParams));

  if (path.startsWith("~") && hasUrlParams) {
    throw new Error(
      `[router.${methodName}] Absolute path "${path}" cannot be used under parent route with URL parameters`,
    );
  }
}
