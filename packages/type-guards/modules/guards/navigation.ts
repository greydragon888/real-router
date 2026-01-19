// packages/type-guards/modules/guards/navigation.ts

import type { NavigationOptions } from "router6-types";

// Constant in module scope - created once, not on every call
const NAVIGATION_OPTIONS_FIELDS = [
  "replace",
  "reload",
  "skipTransition",
  "force",
  "forceDeactivate",
  "redirected",
] as const;

/**
 * Type guard for NavigationOptions.
 * Validates all optional boolean fields.
 *
 * @param value - Value to check
 * @returns true if value is a valid NavigationOptions object
 *
 * @example
 * isNavigationOptions({ replace: true });                    // true
 * isNavigationOptions({ reload: false, force: true });       // true
 * isNavigationOptions({ replace: "true" });                  // false (not boolean)
 * isNavigationOptions(null);                                 // false
 */
export function isNavigationOptions(
  value: unknown,
): value is NavigationOptions {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // for-of instead of .every() - no iterator/callback allocation
  for (const field of NAVIGATION_OPTIONS_FIELDS) {
    const fieldValue = obj[field];

    if (fieldValue !== undefined && typeof fieldValue !== "boolean") {
      return false;
    }
  }

  return true;
}
