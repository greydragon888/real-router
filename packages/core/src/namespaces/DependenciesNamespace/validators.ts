// packages/core/src/namespaces/DependenciesNamespace/validators.ts

/**
 * Static validation functions for DependenciesNamespace.
 * Called by Router facade before instance methods.
 *
 * Extracted from DependenciesNamespace class for better separation of concerns.
 */

import { getTypeDescription } from "type-guards";

import { DEPENDENCY_LIMITS } from "./constants";

/**
 * Validates that dependency name is a string.
 * Called by facade before get/remove/has operations.
 */
export function validateDependencyName(
  name: unknown,
  methodName: string,
): asserts name is string {
  if (typeof name !== "string") {
    throw new TypeError(
      `[router.${methodName}]: dependency name must be a string, got ${typeof name}`,
    );
  }
}

/**
 * Validates setDependency name argument.
 * Value is not validated - any value is valid.
 */
export function validateSetDependencyArgs(
  name: unknown,
): asserts name is string {
  if (typeof name !== "string") {
    throw new TypeError(
      `[router.setDependency]: dependency name must be a string, got ${typeof name}`,
    );
  }
}

/**
 * Validates that dependencies object is a plain object without getters.
 * Called by facade before setMultiple/constructor.
 */
export function validateDependenciesObject(
  deps: unknown,
  methodName: string,
): asserts deps is Record<string, unknown> {
  // Reject non-plain objects (classes, Date, Map, Array)
  if (!(deps && typeof deps === "object" && deps.constructor === Object)) {
    throw new TypeError(
      `[router.${methodName}] Invalid argument: expected plain object, received ${getTypeDescription(deps)}`,
    );
  }

  // Getters can throw, return different values, or have side effects
  for (const key in deps) {
    if (Object.getOwnPropertyDescriptor(deps, key)?.get) {
      throw new TypeError(
        `[router.${methodName}] Getters not allowed: "${key}"`,
      );
    }
  }
}

/**
 * Validates that dependency exists (not undefined).
 * Throws ReferenceError if dependency is not found.
 */
export function validateDependencyExists(
  value: unknown,
  dependencyName: string,
): asserts value is NonNullable<unknown> {
  if (value === undefined) {
    throw new ReferenceError(
      `[router.getDependency]: dependency "${dependencyName}" not found`,
    );
  }
}

/**
 * Validates that adding dependencies won't exceed the hard limit.
 * Called before bulk operations to ensure atomicity.
 */
export function validateDependencyLimit(
  currentCount: number,
  newCount: number,
  methodName: string,
): void {
  const totalCount = currentCount + newCount;

  if (totalCount >= DEPENDENCY_LIMITS.HARD_LIMIT) {
    throw new Error(
      `[router.${methodName}] Dependency limit exceeded (${DEPENDENCY_LIMITS.HARD_LIMIT}). ` +
        `Current: ${totalCount}. This is likely a bug in your code.`,
    );
  }
}
