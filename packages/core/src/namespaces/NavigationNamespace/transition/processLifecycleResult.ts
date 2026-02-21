// packages/real-router/modules/transition/processLifecycleResult.ts

import { isState } from "type-guards";

import { errorCodes } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type { SyncErrorMetadata } from "./wrapSyncError";
import type { State, ActivationFn } from "@real-router/types";

/**
 * Builds error metadata from a caught promise rejection.
 * Extracts message, stack, and cause from Error instances.
 */
function buildErrorMetadata(
  error: unknown,
  errorData: SyncErrorMetadata,
): SyncErrorMetadata {
  if (error instanceof Error) {
    return {
      ...errorData,
      message: error.message,
      stack: error.stack,
      // Error.cause requires ES2022+ - safely access it if present
      ...("cause" in error &&
        error.cause !== undefined && { cause: error.cause }),
    };
  }

  if (error && typeof error === "object") {
    return { ...errorData, ...error };
  }

  return errorData;
}

// Helper: Lifecycle results Processing Function
export const processLifecycleResult = async (
  result: ReturnType<ActivationFn>,
  currentState: State,
): Promise<State> => {
  if (result === undefined) {
    return currentState;
  }

  if (typeof result === "boolean") {
    if (result) {
      return currentState;
    } else {
      throw new RouterError(errorCodes.TRANSITION_ERR, {});
    }
  }

  if (isState(result)) {
    return result;
  }

  // Optimization: single try/catch instead of .then(onFulfill, onReject)
  try {
    const resVal = await (result as Promise<State | boolean | undefined>);

    return await processLifecycleResult(resVal, currentState);
  } catch (error: unknown) {
    throw new RouterError(
      errorCodes.TRANSITION_ERR,
      buildErrorMetadata(error, {}),
    );
  }
};
