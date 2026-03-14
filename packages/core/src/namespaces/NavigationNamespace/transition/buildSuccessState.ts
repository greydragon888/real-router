import { freezeStateInPlace } from "../../../helpers";

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

  return freezeStateInPlace({
    ...finalState,
    transition: transitionMeta,
  });
}
