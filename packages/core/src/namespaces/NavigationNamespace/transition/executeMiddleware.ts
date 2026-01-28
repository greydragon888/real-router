// packages/real-router/modules/transition/executeMiddleware.ts

import { logger } from "logger";
import { isState } from "type-guards";

import { makeError } from "./makeError";
import { mergeStates } from "./mergeStates";
import { processLifecycleResult } from "./processLifecycleResult";
import { safeCallback, type StrictDoneFn } from "./shared";
import { wrapSyncError } from "./wrapSyncError";
import { errorCodes } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type {
  DoneFn,
  State,
  ActivationFn,
  RouterError as RouterErrorType,
} from "@real-router/types";

const LOG_TAG = "core:middleware";

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
        LOG_TAG,
      );

      return;
    }

    if (err) {
      safeCallback(
        callback,
        makeError(errorCodes.TRANSITION_ERR, err),
        currentState,
        LOG_TAG,
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
          LOG_TAG,
          "Warning: State mutated during middleware execution",
          { from: currentState, to: newState },
        );
      }

      currentState = mergeStates(newState, currentState);
    }

    if (index >= middlewareFunctions.length) {
      safeCallback(callback, undefined, currentState, LOG_TAG);

      return;
    }

    const middlewareFn = middlewareFunctions[index++];

    try {
      const result = middlewareFn(currentState, fromState, done);

      processLifecycleResult(result, done);
    } catch (syncError: unknown) {
      done(
        new RouterError(errorCodes.TRANSITION_ERR, wrapSyncError(syncError)),
      );
    }
  };

  processNext();
};
