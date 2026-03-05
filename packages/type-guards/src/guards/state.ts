// packages/type-guards/modules/guards/state.ts

import { isMetaFields, isRequiredFields } from "../internal/meta-fields";

import type { Params, State } from "@real-router/types";

/**
 * Type guard for State object.
 * Checks for required fields: name, params, path.
 * Does NOT validate meta field deeply.
 *
 * @param value - Value to check
 * @returns true if value is a valid State object
 *
 * @example
 * isState({ name: 'home', params: {}, path: '/' }); // true
 * isState({ name: 'home', path: '/' }); // false (missing params)
 */
export function isState<P extends Params = Params, MP extends Params = Params>(
  value: unknown,
): value is State<P, MP> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return isRequiredFields(obj);
}

/**
 * Enhanced type guard for State with deep validation.
 * Checks not only presence but also types of all required fields.
 * Validates params using isParams and meta structure if present.
 *
 * @param value - Value to check
 * @returns true if value is a valid State object with correct types
 *
 * @example
 * isStateStrict({ name: 'home', params: {}, path: '/', meta: { id: 1 } }); // true
 * isStateStrict({ name: 'home', params: 'invalid', path: '/' }); // false
 */
export function isStateStrict<
  P extends Params = Params,
  MP extends Params = Params,
>(value: unknown): value is State<P, MP> {
  // Basic structure check
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check required fields and their types
  if (!isRequiredFields(obj)) {
    return false;
  }

  // Validate meta if present
  if (obj.meta !== undefined) {
    return isMetaFields(obj.meta);
  }

  return true;
}
