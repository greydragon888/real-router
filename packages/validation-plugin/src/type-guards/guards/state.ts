// packages/validation-plugin/src/type-guards/guards/state.ts

import { isRequiredFields } from "../internal/meta-fields";

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
export function isState<P extends Params = Params>(
  value: unknown,
): value is State<P> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return isRequiredFields(obj);
}
