// packages/core/src/namespaces/NavigationNamespace/validators.ts

/**
 * Static validation functions for NavigationNamespace.
 * Called by Router facade before instance methods.
 */

import { getTypeDescription, isNavigationOptions } from "type-guards";

import type { NavigationOptions, State } from "@real-router/types";

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
 * Validates navigateToState arguments.
 */
export function validateNavigateToStateArgs(
  toState: unknown,
  fromState: unknown,
  opts: unknown,
  emitSuccess: unknown,
): void {
  // toState must be a valid state object
  if (
    !toState ||
    typeof toState !== "object" ||
    typeof (toState as State).name !== "string" ||
    typeof (toState as State).path !== "string"
  ) {
    throw new TypeError(
      `[router.navigateToState] Invalid toState: expected State object with name and path`,
    );
  }

  // fromState can be undefined or a valid state
  if (
    fromState !== undefined &&
    (!fromState ||
      typeof fromState !== "object" ||
      typeof (fromState as State).name !== "string")
  ) {
    throw new TypeError(
      `[router.navigateToState] Invalid fromState: expected State object or undefined`,
    );
  }

  // opts must be an object
  if (typeof opts !== "object" || opts === null) {
    throw new TypeError(
      `[router.navigateToState] Invalid opts: expected NavigationOptions object, got ${getTypeDescription(opts)}`,
    );
  }

  // emitSuccess must be a boolean
  if (typeof emitSuccess !== "boolean") {
    throw new TypeError(
      `[router.navigateToState] Invalid emitSuccess: expected boolean, got ${getTypeDescription(emitSuccess)}`,
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
