// packages/real-router/modules/transition/processLifecycleResult.ts

import { isPromise, isState } from "type-guards";

import { errorCodes } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type { SyncErrorMetadata } from "./wrapSyncError";
import type { State, ActivationFn } from "@real-router/types";

/**
 * Builds error metadata from a caught promise rejection.
 * Extracts message, stack, and cause from Error instances.
 */
function buildErrorMetadata(
  error_: unknown,
  errorData: SyncErrorMetadata,
): SyncErrorMetadata {
  if (error_ instanceof Error) {
    return {
      ...errorData,
      message: error_.message,
      stack: error_.stack,
      // Error.cause requires ES2022+ - safely access it if present
      ...("cause" in error_ &&
        error_.cause !== undefined && { cause: error_.cause }),
    };
  }

  if (error_ && typeof error_ === "object") {
    return { ...errorData, ...error_ };
  }

  return errorData;
}

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

  if (isPromise<State | boolean | undefined>(result)) {
    // Optimization: single try/catch instead of .then(onFulfill, onReject)
    try {
      const resVal = await result;

      return await processLifecycleResult(resVal, currentState, segment);
    } catch (error_: unknown) {
      throw new RouterError(
        errorCodes.TRANSITION_ERR,
        buildErrorMetadata(error_, errorData),
      );
    }
  }

  // This should never be reached - all valid ActivationFn return types are handled above
  // If we get here, it means the activation function returned an unexpected type
  throw new RouterError(errorCodes.TRANSITION_ERR, {
    ...errorData,
    message: `Invalid lifecycle result type: ${typeof result}`,
  });
};
