// packages/core/src/namespaces/NavigationNamespace/transition/index.ts

import { executeLifecycleHooks } from "./executeLifecycleHooks";
import { constants, errorCodes } from "../../../constants";
import { RouterError } from "../../../RouterError";
import { getTransitionPath, nameToIDs } from "../../../transitionPath";

import type { TransitionDependencies, TransitionOutput } from "../types";
import type { NavigationOptions, State } from "@real-router/types";

export async function transition(
  deps: TransitionDependencies,
  toState: State,
  fromState: State | undefined,
  opts: NavigationOptions,
): Promise<TransitionOutput> {
  // We're caching the necessary data
  const [canDeactivateFunctions, canActivateFunctions] =
    deps.getLifecycleFunctions();
  const isUnknownRoute = toState.name === constants.UNKNOWN_ROUTE;

  // State management functions
  // Issue #36: Check both explicit cancellation AND router shutdown
  const isCancelled = () => !deps.isActive();

  const { toDeactivate, toActivate, intersection } = getTransitionPath(
    toState,
    fromState,
  );

  // determine the necessary steps
  const shouldDeactivate =
    fromState && !opts.forceDeactivate && toDeactivate.length > 0;
  const shouldActivate = !isUnknownRoute && toActivate.length > 0;

  if (shouldDeactivate) {
    await executeLifecycleHooks(
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
    await executeLifecycleHooks(
      canActivateFunctions,
      toState,
      fromState,
      toActivate,
      errorCodes.CANNOT_ACTIVATE,
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

    for (const name of previousActiveSegments) {
      if (!activeSegments.includes(name) && canDeactivateFunctions.has(name)) {
        deps.clearCanDeactivate(name);
      }
    }
  }

  return {
    state: toState,
    meta: {
      phase: "activating",
      segments: {
        deactivated: toDeactivate,
        activated: toActivate,
        intersection,
      },
    },
  };
}
