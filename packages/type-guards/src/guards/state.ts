// packages/type-guards/modules/guards/state.ts

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

/**
 * Type guard for State. Performs the same required-field check as {@link isState}
 * (`name` via `isRouteName`, `path` is a string, `params` via `isParams`) — the
 * "Strict" in the name is historical: there is no deeper meta-field validation,
 * and `meta.id` is intentionally NOT type-checked (history.state restores
 * serialize it as a string — see the backward-compat property test). Re-exported
 * as `isState` by the browser and hash plugins for validating `history.state`.
 *
 * @param value - Value to check
 * @returns true if value has the required State fields with valid types
 *
 * @example
 * isStateStrict({ name: 'home', params: {}, path: '/' }); // true
 * isStateStrict({ name: 'home', params: 'invalid', path: '/' }); // false
 */
// eslint-disable-next-line sonarjs/no-identical-functions -- intentional historical alias of isState (same required-field check); see JSDoc
export function isStateStrict<P extends Params = Params>(
  value: unknown,
): value is State<P> {
  // Basic structure check
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check required fields and their types
  return isRequiredFields(obj);
}
