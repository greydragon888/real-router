// packages/real-router/modules/transition/index.ts

import { RouterError, constants, errorCodes } from "@real-router/core";

import { executeLifecycleHooks } from "./executeLifecycleHooks";
import { executeMiddleware } from "./executeMiddleware";
import { getTransitionPath, nameToIDs } from "../transitionPath";

import type {
  NavigationOptions,
  CancelFn,
  State,
  DefaultDependencies,
  Router,
  RouterError as RouterErrorType,
} from "core-types";

/**
 * Strict callback type where state is always provided.
 * Used internally in transition chain where state is guaranteed.
 */
type StrictDoneFn = (error: RouterErrorType | undefined, state: State) => void;

export function transition<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
  toState: State,
  fromState: State | undefined,
  opts: NavigationOptions,
  transitionCallback: (err: RouterErrorType | undefined, state: State) => void,
): CancelFn {
  // The state of transaction
  let cancelled = false;
  let completed = false;

  // We're caching the necessary data
  const [canDeactivateFunctions, canActivateFunctions] =
    router.getLifecycleFunctions();
  const middlewareFunctions = router.getMiddlewareFunctions();
  const isUnknownRoute = toState.name === constants.UNKNOWN_ROUTE;

  // State management functions
  // Issue #36: Check both explicit cancellation AND router shutdown
  // Issue #50: Use isActive() instead of isStarted() for two-phase start support
  // isActive() is true during initial start transition, isStarted() is false
  const isCancelled = () => cancelled || !router.isActive();

  const cancel = () => {
    if (!cancelled && !completed) {
      cancelled = true;
      complete(new RouterError(errorCodes.TRANSITION_CANCELLED));
    }
  };

  const complete = (err: RouterErrorType | undefined, state?: State) => {
    if (completed) {
      return;
    }

    completed = true;
    transitionCallback(err, state ?? toState);
  };

  // The main transaction logic
  const runTransition = (): void => {
    const { toDeactivate, toActivate } = getTransitionPath(toState, fromState);

    // determine the necessary steps
    const shouldDeactivate =
      fromState && !opts.forceDeactivate && toDeactivate.length > 0;
    const shouldActivate = !isUnknownRoute && toActivate.length > 0;
    const shouldRunMiddleware = middlewareFunctions.length > 0;

    // The chain of execution
    const runDeactivation = (callback: StrictDoneFn) => {
      if (shouldDeactivate) {
        executeLifecycleHooks(
          canDeactivateFunctions,
          toState,
          fromState,
          toDeactivate,
          errorCodes.CANNOT_DEACTIVATE,
          isCancelled,
          callback,
        );
      } else {
        callback(undefined, toState);
      }
    };

    const runActivation = (state: State, callback: StrictDoneFn) => {
      if (shouldActivate) {
        executeLifecycleHooks(
          canActivateFunctions,
          state,
          fromState,
          toActivate,
          errorCodes.CANNOT_ACTIVATE,
          isCancelled,
          (err, newState) => {
            callback(err, newState);
          },
        );
      } else {
        // State is already frozen from makeState()
        callback(undefined, state);
      }
    };

    const runMiddleware = (state: State, callback: StrictDoneFn) => {
      if (shouldRunMiddleware) {
        executeMiddleware(
          middlewareFunctions,
          state,
          fromState,
          isCancelled,
          (err, newState) => {
            callback(err, newState);
          },
        );
      } else {
        // State is already frozen from makeState()
        callback(undefined, state);
      }
    };

    // perform a chain
    runDeactivation((err, state) => {
      if (err) {
        complete(err, state);

        return;
      }

      runActivation(state, (runActivationErr, runActivationState) => {
        if (runActivationErr) {
          complete(runActivationErr, runActivationState);

          return;
        }

        runMiddleware(
          runActivationState,
          (runMiddlewareErr, runMiddlewareState) => {
            if (runMiddlewareErr) {
              complete(runMiddlewareErr, runMiddlewareState);

              return;
            }

            // Automatic cleaning of inactive segments
            if (fromState) {
              const activeSegments = nameToIDs(toState.name);
              const previousActiveSegments = nameToIDs(fromState.name);
              const activeSet = new Set(activeSegments);

              for (const name of previousActiveSegments) {
                if (!activeSet.has(name) && canDeactivateFunctions.has(name)) {
                  router.clearCanDeactivate(name);
                }
              }
            }

            complete(undefined, runMiddlewareState);
          },
        );
      });
    });
  };

  // Launch transition
  runTransition();

  return cancel;
}
