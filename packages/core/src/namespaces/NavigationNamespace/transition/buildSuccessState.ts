import type { TransitionOutput } from "../types";
import type {
  NavigationOptions,
  State,
  TransitionMeta,
} from "@real-router/types";

export function buildSuccessState(
  finalState: State,
  transitionOutput: TransitionOutput["meta"],
  fromState: State | undefined,
  opts: NavigationOptions,
): State {
  const transitionMeta: TransitionMeta = {
    phase: transitionOutput.phase,
    ...(fromState?.name !== undefined && { from: fromState.name }),
    reason: "success",
    segments: transitionOutput.segments,
    ...(opts.reload !== undefined && { reload: opts.reload }),
    ...(opts.redirected !== undefined && { redirected: opts.redirected }),
  };

  Object.freeze(transitionMeta.segments.deactivated);
  Object.freeze(transitionMeta.segments.activated);
  Object.freeze(transitionMeta.segments);
  Object.freeze(transitionMeta);

  return {
    ...finalState,
    transition: transitionMeta,
  };
}
