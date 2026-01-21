// packages/real-router/modules/transition/executeMiddleware.ts

import { logger } from "logger";
import { isState } from "type-guards";

import { errorCodes, RouterError } from "@real-router/core";

import { makeError } from "./makeError";
import { mergeStates } from "./mergeStates";
import { processLifecycleResult } from "./processLifecycleResult";
import { wrapSyncError } from "./wrapSyncError";

import type {
  DoneFn,
  State,
  ActivationFn,
  RouterError as RouterErrorType,
} from "core-types";

/**
 * Strict callback type where state is always provided.
 *
 * @internal
 */
type StrictDoneFn = (error: RouterErrorType | undefined, state: State) => void;

/**
 * Safely invokes a callback, catching and logging any errors.
 *
 * @internal
 */
function safeCallback(
  callback: StrictDoneFn,
  error: RouterErrorType | undefined,
  state: State,
): void {
  try {
    callback(error, state);
  } catch (error_) {
    logger.error(
      "real-router:middleware",
      "Error in middleware callback:",
      error_,
    );
  }
}

// Helper: processing middleware
export const executeMiddleware = (
  middlewareFunctions: ActivationFn[],
  toState: State,
  fromState: State | undefined,
  isCancelled: () => boolean,
  callback: StrictDoneFn,
): void => {
  let currentState = toState;
  let index = 0;

  // If the transition is cancelled, we will not process the middleware
  // Note: Middleware redirects are not supported - errors pass through
  const done: DoneFn = (err, state) => {
    if (err) {
      processNext(err);
    } else {
      processNext(undefined, state);
    }
  };

  const processNext = (err?: RouterErrorType, newState?: State): void => {
    if (isCancelled()) {
      safeCallback(
        callback,
        new RouterError(errorCodes.TRANSITION_CANCELLED),
        currentState,
      );

      return;
    }

    if (err) {
      safeCallback(
        callback,
        makeError(errorCodes.TRANSITION_ERR, err),
        currentState,
      );

      return;
    }

    // Processing a new state
    // Optimization: Early return for undefined newState (most common case ~90%+)
    // This avoids isState() call and subsequent checks
    if (!newState) {
      // Fast path: skip all checks
    } else if (newState !== currentState && isState(newState)) {
      const hasChanged =
        newState.name !== currentState.name ||
        newState.params !== currentState.params ||
        newState.path !== currentState.path;

      if (hasChanged) {
        logger.error(
          "real-router:middleware",
          "Warning: State mutated during middleware execution",
          { from: currentState, to: newState },
        );
      }

      currentState = mergeStates(newState, currentState);
    }

    if (index >= middlewareFunctions.length) {
      safeCallback(callback, undefined, currentState);

      return;
    }

    const middlewareFn = middlewareFunctions[index++];

    try {
      const result = middlewareFn.call(null, currentState, fromState, done);

      processLifecycleResult(result, done);
    } catch (syncError: unknown) {
      done(
        new RouterError(errorCodes.TRANSITION_ERR, wrapSyncError(syncError)),
      );
    }
  };

  processNext();
};
