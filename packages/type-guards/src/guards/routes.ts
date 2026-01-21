// packages/type-guards/modules/guards/routes.ts

import {
  FULL_ROUTE_PATTERN,
  MAX_ROUTE_NAME_LENGTH,
} from "../internal/router-error";

/**
 * Type guard that checks if a value is a valid route name.
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
 * @param name - Value to check
 * @returns true if name is a valid route name string
 *
 * @example
 * // Valid names
 * isRouteName("");                        // true (root node)
 * isRouteName("home");                    // true
 * isRouteName("users.profile");           // true
 * isRouteName("admin_panel");             // true
 * isRouteName("api-v2");                  // true
 * isRouteName("@@real-router/UNKNOWN_ROUTE"); // true (system route)
 *
 * @example
 * // Invalid names
 * isRouteName("   ");                     // false (only whitespace)
 * isRouteName(".users");                  // false (leading dot)
 * isRouteName("users.");                  // false (trailing dot)
 * isRouteName("users..profile");          // false (consecutive dots)
 * isRouteName("users.123");               // false (segment starts with number)
 * isRouteName("users profile");           // false (contains space)
 */
export function isRouteName(name: unknown): name is string {
  if (typeof name !== "string") {
    return false;
  }

  // Empty string is valid (represents root node)
  if (name === "") {
    return true;
  }

  // Too long is invalid
  if (name.length > MAX_ROUTE_NAME_LENGTH) {
    return false;
  }

  // System routes are valid (bypass pattern validation)
  if (name.startsWith("@@")) {
    return true;
  }

  // Regular routes must match pattern
  // Note: FULL_ROUTE_PATTERN rejects whitespace-only strings
  return FULL_ROUTE_PATTERN.test(name);
}
