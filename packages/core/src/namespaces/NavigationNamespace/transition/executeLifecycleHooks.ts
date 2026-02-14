// packages/real-router/modules/transition/executeLifecycleHooks.ts

import { logger } from "logger";
import { isState } from "type-guards";

import { RouterError, errorCodes } from "@real-router/core";

import { rethrowAsRouterError } from "./makeError";
import { mergeStates } from "./mergeStates";
import { processLifecycleResult } from "./processLifecycleResult";

import type { State, ActivationFn } from "@real-router/types";

// Helper: execution of the Lifecycle Hooks group
export const executeLifecycleHooks = async (
  hooks: Map<string, ActivationFn>,
  toState: State,
  fromState: State | undefined,
  segments: string[],
  errorCode: string,
  isCancelled: () => boolean,
): Promise<State> => {
  let currentState = toState;
  const segmentsToProcess = segments.filter((name) => hooks.has(name));

  if (segmentsToProcess.length === 0) {
    return currentState;
  }

  for (const segment of segmentsToProcess) {
    if (isCancelled()) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    }

    // Safe cast: segmentsToProcess only contains names that exist in hooks (filtered above)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed by filter
    const hookFn = hooks.get(segment)!;

    try {
      const result = hookFn(currentState, fromState);
      const newState = await processLifecycleResult(
        result,
        currentState,
        segment,
      );

      // Optimization: Early return for undefined newState (most common case ~90%+)
      // This avoids isState() call and subsequent checks
      if (newState !== currentState && isState(newState)) {
        // Guards cannot redirect to a different route
        if (newState.name !== currentState.name) {
          throw new RouterError(errorCode, {
            message:
              "Guards cannot redirect to different route. Use middleware.",
            attemptedRedirect: {
              name: newState.name,
              params: newState.params,
              path: newState.path,
            },
          });
        }

        // Same route - safe to merge (param modifications, meta changes)
        const hasChanged =
          newState.params !== currentState.params ||
          newState.path !== currentState.path;

        if (hasChanged) {
          logger.error(
            "core:transition",
            "Warning: State mutated during transition",
            { from: currentState, to: newState },
          );
        }

        currentState = mergeStates(newState, currentState);
      }
    } catch (error: unknown) {
      rethrowAsRouterError(error, errorCode, segment);
    }
  }

  return currentState;
};
