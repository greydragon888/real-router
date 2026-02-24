// packages/core/src/namespaces/StateNamespace/validators.ts

/**
 * Static validation functions for StateNamespace.
 * Called by Router facade before instance methods.
 */

import { isString, isParams, getTypeDescription } from "type-guards";

/**
 * Validates makeState arguments.
 */
export function validateMakeStateArgs(
  name: unknown,
  params: unknown,
  path: unknown,
  forceId: unknown,
): void {
  // Validate name is a string
  if (!isString(name)) {
    throw new TypeError(
      `[router.makeState] Invalid name: ${getTypeDescription(name)}. Expected string.`,
    );
  }

  // Validate params if provided
  if (params !== undefined && !isParams(params)) {
    throw new TypeError(
      `[router.makeState] Invalid params: ${getTypeDescription(params)}. Expected plain object.`,
    );
  }

  // Validate path if provided
  if (path !== undefined && !isString(path)) {
    throw new TypeError(
      `[router.makeState] Invalid path: ${getTypeDescription(path)}. Expected string.`,
    );
  }

  // Validate forceId if provided
  if (forceId !== undefined && typeof forceId !== "number") {
    throw new TypeError(
      `[router.makeState] Invalid forceId: ${getTypeDescription(forceId)}. Expected number.`,
    );
  }
}
