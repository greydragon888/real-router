// packages/real-router/modules/transition/processLifecycleResult.ts

/* eslint-disable promise/always-return, promise/no-callback-in-promise */
import { isPromise, isState } from "type-guards";

import { errorCodes, RouterError } from "@real-router/core";

import type { DoneFn, State, ActivationFn } from "core-types";

// Helper: Lifecycle results Processing Function
export const processLifecycleResult = (
  result: ReturnType<ActivationFn>,
  done: DoneFn,
  segment?: string,
): void => {
  const errorData = segment ? { segment } : {};

  if (result === undefined) {
    // We expect a Done call
    return;
  }

  if (typeof result === "boolean") {
    if (result) {
      done();
    } else {
      done(new RouterError(errorCodes.TRANSITION_ERR, errorData));
    }

    return;
  }

  if (isState(result)) {
    // Type guard should narrow, but TypeScript needs help
    done(undefined, result);

    return;
  }

  if (isPromise<State | boolean | undefined>(result)) {
    // Callback-based API: promise handled internally, not returned
    // Mixing promises with callbacks is intentional for backward compatibility
    // Type assertion needed due to complex union type narrowing
    // Optimization: .then(onFulfill, onReject) instead of .then().catch()
    // This saves 1 Promise allocation per async middleware call
    void result.then(
      (resVal) => {
        // Issue #38: Handle Promise<boolean> same as sync boolean
        if (typeof resVal === "boolean") {
          if (resVal) {
            done();
          } else {
            done(new RouterError(errorCodes.TRANSITION_ERR, errorData));
          }
        } else {
          done(undefined, resVal);
        }
      },
      (error_: unknown) => {
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

        done(new RouterError(errorCodes.TRANSITION_ERR, error));
      },
    );

    return;
  }

  // This should never be reached - all valid ActivationFn return types are handled above
  // If we get here, it means the activation function returned an unexpected type
  done(
    new RouterError(errorCodes.TRANSITION_ERR, {
      ...errorData,
      message: `Invalid lifecycle result type: ${typeof result}`,
    }),
  );
};
