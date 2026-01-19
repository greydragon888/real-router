// packages/router6/modules/transition/executeLifecycleHooks.ts

import { isState } from "type-guards";

import { errorCodes, RouterError } from "router6";

import { makeError } from "./makeError";
import { mergeStates } from "./mergeStates";
import { processLifecycleResult } from "./processLifecycleResult";
import { wrapSyncError } from "./wrapSyncError";

import type {
  DoneFn,
  State,
  ActivationFn,
  RouterError as RouterErrorType,
} from "router6-types";

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
    console.error("router6:lifecycle", "Error in lifecycle callback:", error_);
  }
}

// Helper: execution of the Lifecycle Hooks group
export const executeLifecycleHooks = (
  hooks: Map<string, ActivationFn>,
  toState: State,
  fromState: State | undefined,
  segments: string[],
  errorCode: string,
  isCancelled: () => boolean,
  callback: StrictDoneFn,
): void => {
  let currentState = toState;
  const segmentsToProcess = segments.filter((name) => hooks.has(name));

  if (segmentsToProcess.length === 0) {
    safeCallback(callback, undefined, currentState);

    return;
  }

  let index = 0;

  // If the transition is cancelled, we will not process the hooks
  // Guards cannot redirect - they can only allow (true/undefined) or block (false/error)
  const done: DoneFn = (err, state) => {
    if (err) {
      // Guards cannot redirect - convert any redirect to error
      if (err.redirect) {
        const errorWithoutRedirect = new RouterError(errorCode, {
          message: "Guards cannot redirect. Use middleware for redirects.",
          attemptedRedirect: err.redirect,
        });

        processNext(errorWithoutRedirect);
      } else {
        processNext(err);
      }
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
      safeCallback(callback, makeError(errorCode, err), currentState);

      return;
    }

    // Processing a new state
    // Optimization: Early return for undefined newState (most common case ~90%+)
    // This avoids isState() call and subsequent checks
    if (!newState) {
      // Fast path: skip all checks
    } else if (newState !== currentState && isState(newState)) {
      // Guards cannot redirect to a different route
      if (newState.name !== currentState.name) {
        const redirectNotAllowedErr = new RouterError(errorCode, {
          message: "Guards cannot redirect to different route. Use middleware.",
          attemptedRedirect: {
            name: newState.name,
            params: newState.params,
            path: newState.path,
          },
        });

        safeCallback(callback, redirectNotAllowedErr, currentState);

        return;
      }

      // Same route - safe to merge (param modifications, meta changes)
      const hasChanged =
        newState.params !== currentState.params ||
        newState.path !== currentState.path;

      if (hasChanged) {
        console.error(
          "router6:transition",
          "Warning: State mutated during transition",
          { from: currentState, to: newState },
        );
      }

      currentState = mergeStates(newState, currentState);
    }

    if (index >= segmentsToProcess.length) {
      safeCallback(callback, undefined, currentState);

      return;
    }

    const segment = segmentsToProcess[index++];
    // Safe cast: segmentsToProcess only contains names that exist in hooks (filtered above)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed by filter
    const hookFn = hooks.get(segment)!;

    try {
      const result = hookFn.call(null, currentState, fromState, done);

      processLifecycleResult(result, done, segment);
    } catch (syncError: unknown) {
      // Note: TRANSITION_ERR is placeholder - makeError() will set correct code
      done(
        new RouterError(
          errorCodes.TRANSITION_ERR,
          wrapSyncError(syncError, segment),
        ),
      );
    }
  };

  processNext();
};
