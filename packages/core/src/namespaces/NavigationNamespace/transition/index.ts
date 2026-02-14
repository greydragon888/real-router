// packages/real-router/modules/transition/index.ts

import { executeLifecycleHooks } from "./executeLifecycleHooks";
import { executeMiddleware } from "./executeMiddleware";
import { constants, errorCodes } from "../../../constants";
import { RouterError } from "../../../RouterError";
import { getTransitionPath, nameToIDs } from "../../../transitionPath";

import type { TransitionDependencies } from "../types";
import type { NavigationOptions, State } from "@real-router/types";

export async function transition(
  deps: TransitionDependencies,
  toState: State,
  fromState: State | undefined,
  opts: NavigationOptions,
): Promise<State> {
  // We're caching the necessary data
  const [canDeactivateFunctions, canActivateFunctions] =
    deps.getLifecycleFunctions();
  const middlewareFunctions = deps.getMiddlewareFunctions();
  const isUnknownRoute = toState.name === constants.UNKNOWN_ROUTE;

  // State management functions
  // Issue #36: Check both explicit cancellation AND router shutdown
  // Issue #50: Use isActive() instead of isStarted() for two-phase start support
  // isActive() is true during initial start transition, isStarted() is false
  const isCancelled = () => !deps.isActive();

  const { toDeactivate, toActivate } = getTransitionPath(toState, fromState);

  // determine the necessary steps
  const shouldDeactivate =
    fromState && !opts.forceDeactivate && toDeactivate.length > 0;
  const shouldActivate = !isUnknownRoute && toActivate.length > 0;
  const shouldRunMiddleware = middlewareFunctions.length > 0;

  let currentState = toState;

  if (shouldDeactivate) {
    currentState = await executeLifecycleHooks(
      canDeactivateFunctions,
      toState,
      fromState,
      toDeactivate,
      errorCodes.CANNOT_DEACTIVATE,
      isCancelled,
    );
  }

  if (isCancelled()) {
    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
  }

  if (shouldActivate) {
    currentState = await executeLifecycleHooks(
      canActivateFunctions,
      currentState,
      fromState,
      toActivate,
      errorCodes.CANNOT_ACTIVATE,
      isCancelled,
    );
  }

  if (isCancelled()) {
    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
  }

  if (shouldRunMiddleware) {
    currentState = await executeMiddleware(
      middlewareFunctions,
      currentState,
      fromState,
      isCancelled,
    );
  }

  if (isCancelled()) {
    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
  }

  // Automatic cleaning of inactive segments
  if (fromState) {
    const activeSegments = nameToIDs(toState.name);
    const previousActiveSegments = nameToIDs(fromState.name);
    const activeSet = new Set(activeSegments);

    for (const name of previousActiveSegments) {
      if (!activeSet.has(name) && canDeactivateFunctions.has(name)) {
        deps.clearCanDeactivate(name);
      }
    }
  }

  return currentState;
}
