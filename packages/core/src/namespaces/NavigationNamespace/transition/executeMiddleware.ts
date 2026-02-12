// packages/real-router/modules/transition/executeMiddleware.ts

import { logger } from "logger";
import { isState } from "type-guards";

import { makeError } from "./makeError";
import { mergeStates } from "./mergeStates";
import { processLifecycleResult } from "./processLifecycleResult";
import { wrapSyncError } from "./wrapSyncError";
import { errorCodes } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type { State, ActivationFn } from "@real-router/types";

// Helper: processing middleware
export const executeMiddleware = async (
  middlewareFunctions: ActivationFn[],
  toState: State,
  fromState: State | undefined,
  isCancelled: () => boolean,
): Promise<State> => {
  let currentState = toState;

  for (const middlewareFn of middlewareFunctions) {
    if (isCancelled()) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    }

    try {
      const result = middlewareFn(currentState, fromState);
      const newState = await processLifecycleResult(result, currentState);

      // Optimization: Early return for undefined newState (most common case ~90%+)
      // This avoids isState() call and subsequent checks
      if (newState !== currentState && isState(newState)) {
        const hasChanged =
          newState.name !== currentState.name ||
          newState.params !== currentState.params ||
          newState.path !== currentState.path;

        if (hasChanged) {
          logger.error(
            "core:middleware",
            "Warning: State mutated during middleware execution",
            { from: currentState, to: newState },
          );
        }

        currentState = mergeStates(newState, currentState);
      }
    } catch (error: unknown) {
      if (error instanceof RouterError) {
        const err = makeError(errorCodes.TRANSITION_ERR, error);

        if (err) {
          throw err;
        }
      }

      throw new RouterError(errorCodes.TRANSITION_ERR, wrapSyncError(error));
    }
  }

  return currentState;
};
