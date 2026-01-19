// packages/type-guards/modules/validators/routes.ts

import {
  createRouterError,
  FULL_ROUTE_PATTERN,
  HAS_NON_WHITESPACE,
  MAX_ROUTE_NAME_LENGTH,
} from "../internal/router-error";

/**
 * Validates that a route name is a valid string and matches the expected format.
 * Throws a descriptive error if validation fails.
 *
 * Route name rules:
 * - Must be a string
 * - Empty string ("") is valid and represents the root node
 * - Can use dots (.) for hierarchy (e.g., "users.profile")
 * - Each segment must match [a-zA-Z_][a-zA-Z0-9_-]*
 * - No consecutive dots (..)
 * - No leading/trailing dots
 * - Cannot contain only whitespace
 * - System routes (starting with @@) bypass pattern validation
 *
 * @param name - Route name to validate
 * @param methodName - Name of calling method for error messages
 * @throws {TypeError} If name is invalid
 *
 * @example
 * // Valid names
 * validateRouteName("", "add");                        // ok (root node)
 * validateRouteName("home", "add");                    // ok
 * validateRouteName("users.profile", "add");           // ok
 * validateRouteName("@@real-router/UNKNOWN_ROUTE", "add"); // ok (system route)
 *
 * @example
 * // Invalid names (throws)
 * validateRouteName("   ", "add");                     // throws (only whitespace)
 * validateRouteName(".users", "add");                  // throws (leading dot)
 * validateRouteName("users.", "add");                  // throws (trailing dot)
 * validateRouteName("users..profile", "add");          // throws (consecutive dots)
 * validateRouteName("users.123", "add");               // throws (segment starts with number)
 * validateRouteName("users profile", "add");           // throws (contains space)
 */
export function validateRouteName(
  name: unknown,
  methodName: string,
): asserts name is string {
  // Type check
  if (typeof name !== "string") {
    throw createRouterError(
      methodName,
      `Route name must be a string, got ${typeof name}`,
    );
  }

  // Empty string is valid (represents root node) - fast path
  if (name === "") {
    return;
  }

  // Whitespace-only strings are invalid
  if (!HAS_NON_WHITESPACE.test(name)) {
    throw createRouterError(
      methodName,
      "Route name cannot contain only whitespace",
    );
  }

  // Length check for technical safety
  if (name.length > MAX_ROUTE_NAME_LENGTH) {
    throw createRouterError(
      methodName,
      `Route name exceeds maximum length of ${MAX_ROUTE_NAME_LENGTH} characters. This is a technical safety limit.`,
    );
  }

  // System routes bypass validation (e.g., @@real-router/UNKNOWN_ROUTE)
  // SECURITY NOTE: System routes are currently created ONLY in router code,
  // not from user input. If this changes, add sanitization for <>"'&\x00-\x1F
  if (name.startsWith("@@")) {
    return;
  }

  // Validate route pattern
  if (!FULL_ROUTE_PATTERN.test(name)) {
    throw createRouterError(
      methodName,
      `Invalid route name "${name}". Each segment must start with a letter or underscore, followed by letters, numbers, underscores, or hyphens. Segments are separated by dots (e.g., "users.profile").`,
    );
  }
}
