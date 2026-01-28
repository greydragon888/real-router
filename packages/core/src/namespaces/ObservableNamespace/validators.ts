import { isState } from "type-guards";

import type { State } from "@real-router/types";

/**
 * Validates that toState is provided and is a valid State object.
 *
 * @throws TypeError if validation fails
 */
export function validateRequiredToState(
  toState: State | undefined,
  eventName: string,
): asserts toState is State {
  if (!toState) {
    throw new TypeError(
      `[router.invokeEventListeners] toState is required for event "${eventName}"`,
    );
  }

  if (!isState(toState)) {
    throw new TypeError(
      `[router.invokeEventListeners] toState is invalid for event "${eventName}". ` +
        `Expected State object with name, path, and params.`,
    );
  }
}

/**
 * Validates that toState (if provided) is a valid State object.
 *
 * @throws TypeError if validation fails
 */
export function validateOptionalToState(
  toState: State | undefined,
  eventName: string,
): void {
  if (toState && !isState(toState)) {
    throw new TypeError(
      `[router.invokeEventListeners] toState is invalid for event "${eventName}". ` +
        `Expected State object with name, path, and params.`,
    );
  }
}

/**
 * Validates that fromState (if provided) is a valid State object.
 *
 * @throws TypeError if validation fails
 */
export function validateOptionalFromState(
  fromState: State | undefined,
  eventName: string,
): void {
  if (fromState && !isState(fromState)) {
    throw new TypeError(
      `[router.invokeEventListeners] fromState is invalid for event "${eventName}". ` +
        `Expected State object with name, path, and params.`,
    );
  }
}
