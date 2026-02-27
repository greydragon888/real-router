// packages/core/src/namespaces/NavigationNamespace/transition/index.ts

import { executeLifecycleGuards } from "./executeLifecycleGuards";
import { constants, errorCodes } from "../../../constants";
import { RouterError } from "../../../RouterError";
import { getTransitionPath } from "../../../transitionPath";

import type { TransitionDependencies, TransitionOutput } from "../types";
import type { NavigationOptions, State } from "@real-router/types";

export async function transition(
  deps: TransitionDependencies,
  toState: State,
  fromState: State | undefined,
  opts: NavigationOptions,
  signal: AbortSignal,
): Promise<TransitionOutput> {
  // We're caching the necessary data
  const [canDeactivateFunctions, canActivateFunctions] =
    deps.getLifecycleFunctions();
  const isUnknownRoute = toState.name === constants.UNKNOWN_ROUTE;

  // State management functions
  // Issue #36: Check both explicit cancellation AND router shutdown
  const isCancelled = () => signal.aborted || !deps.isActive();

  const { toDeactivate, toActivate, intersection } = getTransitionPath(
    toState,
    fromState,
  );

  // determine the necessary steps
  const shouldDeactivate =
    fromState && !opts.forceDeactivate && toDeactivate.length > 0;
  const shouldActivate = !isUnknownRoute && toActivate.length > 0;

  if (shouldDeactivate) {
    await executeLifecycleGuards(
      canDeactivateFunctions,
      toState,
      fromState,
      toDeactivate,
      errorCodes.CANNOT_DEACTIVATE,
      isCancelled,
      signal,
    );
  }

  if (isCancelled()) {
    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
  }

  if (shouldActivate) {
    await executeLifecycleGuards(
      canActivateFunctions,
      toState,
      fromState,
      toActivate,
      errorCodes.CANNOT_ACTIVATE,
      isCancelled,
      signal,
    );
  }

  if (isCancelled()) {
    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
  }

  // Automatic cleaning of inactive segments
  if (fromState) {
    for (const name of toDeactivate) {
      if (!toActivate.includes(name) && canDeactivateFunctions.has(name)) {
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
