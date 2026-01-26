// packages/type-guards/modules/validators/state.ts

import { isState } from "../guards";
import { getTypeDescription } from "../utilities/type-description";

import type { State } from "@real-router/types";

/**
 * Validates that a state has the correct structure.
 * Throws a descriptive error if validation fails.
 *
 * @param state - State to validate
 * @param method - Context for error message
 * @throws {TypeError} If state structure is invalid
 *
 * @example
 * validateState({ name: 'home', params: {}, path: '/' }, 'navigate');  // ok
 * validateState({ name: 'home' }, 'navigate');                         // throws (missing params, path)
 * validateState(null, 'navigate');                                     // throws (not an object)
 */
export function validateState(
  state: unknown,
  method: string,
): asserts state is State {
  if (!isState(state)) {
    throw new TypeError(
      `[${method}] Invalid state structure: ${getTypeDescription(state)}. ` +
        `Expected State object with name, params, and path properties.`,
    );
  }
}
