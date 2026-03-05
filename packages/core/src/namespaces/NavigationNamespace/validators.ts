// packages/core/src/namespaces/NavigationNamespace/validators.ts

/**
 * Static validation functions for NavigationNamespace.
 * Called by Router facade before instance methods.
 */

import { getTypeDescription, isNavigationOptions } from "type-guards";

import type { NavigationOptions } from "@real-router/types";

/**
 * Validates navigate route name argument.
 */
export function validateNavigateArgs(name: unknown): asserts name is string {
  if (typeof name !== "string") {
    throw new TypeError(
      `[router.navigate] Invalid route name: expected string, got ${getTypeDescription(name)}`,
    );
  }
}

/**
 * Validates navigateToDefault arguments.
 */
export function validateNavigateToDefaultArgs(opts: unknown): void {
  // If opts is provided, it must be an object (NavigationOptions)
  if (opts !== undefined && (typeof opts !== "object" || opts === null)) {
    throw new TypeError(
      `[router.navigateToDefault] Invalid options: ${getTypeDescription(opts)}. Expected NavigationOptions object.`,
    );
  }
}

/**
 * Validates that opts is a valid NavigationOptions object.
 */
export function validateNavigationOptions(
  opts: unknown,
  methodName: string,
): asserts opts is NavigationOptions {
  if (!isNavigationOptions(opts)) {
    throw new TypeError(
      `[router.${methodName}] Invalid options: ${getTypeDescription(opts)}. Expected NavigationOptions object.`,
    );
  }
}
