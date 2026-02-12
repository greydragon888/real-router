// packages/real-router/modules/transition/processLifecycleResult.ts

import { isPromise, isState } from "type-guards";

import { errorCodes } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type { State, ActivationFn } from "@real-router/types";

// Helper: Lifecycle results Processing Function
export const processLifecycleResult = async (
  result: ReturnType<ActivationFn>,
  currentState: State,
  segment?: string,
): Promise<State> => {
  const errorData = segment ? { segment } : {};

  if (result === undefined) {
    return currentState;
  }

  if (typeof result === "boolean") {
    if (result) {
      return currentState;
    } else {
      throw new RouterError(errorCodes.TRANSITION_ERR, errorData);
    }
  }

  if (isState(result)) {
    return result;
  }

  if (isPromise<State | boolean | void>(result)) {
    // Optimization: single try/catch instead of .then(onFulfill, onReject)
    try {
      const resVal = await result;
      return await processLifecycleResult(resVal, currentState, segment);
    } catch (error_: unknown) {
      let error: {
        [key: string]: unknown;
        message?: string | undefined;
        segment?: string | undefined;
      } = errorData;

      if (error_ instanceof Error) {
        error = {
          ...errorData,
          message: error_.message,
          stack: error_.stack,
        };

        // Error.cause requires ES2022+ - safely access it if present
        if ("cause" in error_ && error_.cause !== undefined) {
          error.cause = error_.cause;
        }
      } else if (error_ && typeof error_ === "object") {
        error = { ...errorData, ...error_ };
      }

      throw new RouterError(errorCodes.TRANSITION_ERR, error);
    }
  }

  // This should never be reached - all valid ActivationFn return types are handled above
  // If we get here, it means the activation function returned an unexpected type
  throw new RouterError(errorCodes.TRANSITION_ERR, {
    ...errorData,
    message: `Invalid lifecycle result type: ${typeof result}`,
  });
};
