import { abortPreviousNavigation } from "./executeNavigation";
import {
  EMPTY_PARAMS,
  EMPTY_SEARCH,
  errorCodes,
  constants,
} from "../../../constants";
import { RouterError } from "../../../RouterError";
import { nameToIDs } from "../../../transitionPath";

import type { NavigationOptions, State, TransitionMeta } from "../../../types";
import type { NavigationDependencies } from "../types";

/**
 * The one commit primitive that is NOT a transition.
 *
 * It hand-builds an `UNKNOWN_ROUTE` state, freezes it, commits it and emits only
 * `TRANSITION_SUCCESS` — no guards, no FSM transition, no controller, no plan.
 * That is why it sat oddly among the transition machinery it shared a file with
 * (#1607); the one thing it does share is supersession, since committing a
 * not-found state must displace whatever navigation is in flight.
 */

const FROZEN_ACTIVATED: string[] = Object.freeze([
  constants.UNKNOWN_ROUTE,
]) as unknown as string[];
const FROZEN_REPLACE_OPTS: NavigationOptions = Object.freeze({ replace: true });

export function navigateToNotFound(
  deps: NavigationDependencies,
  path: string,
): State {
  // #1186 — liveness gate. This internal commit primitive has no FSM
  // transition of its own, so without this check a `dispose()` that lands
  // while a start-interceptor is parked (FSM already DISPOSED) would let the
  // resuming pipeline commit an UNKNOWN_ROUTE state on the disposed router and
  // `start()` resolve. Symmetric with `navigateToState`'s `canNavigate()` gate
  // (the matched-route branch is already protected). `!isActive()` also covers
  // a merely-stopped (IDLE) router: the only reachable path to that is a direct
  // `router.navigateToNotFound()` on a stopped instance (internal callers run
  // during STARTING, which is active), so the ROUTER_DISPOSED code is slightly
  // broad there — fail-closed is deliberate (committing on a stopped router is
  // out of contract), and the disposed race is the case that matters.
  if (!deps.isActive()) {
    throw new RouterError(errorCodes.ROUTER_DISPOSED);
  }

  abortPreviousNavigation(deps);

  const fromState = deps.getState();
  const deactivated: string[] = fromState
    ? nameToIDs(fromState.name).toReversed()
    : [];

  Object.freeze(deactivated);

  const segments: TransitionMeta["segments"] = {
    deactivated,
    activated: FROZEN_ACTIVATED,
    intersection: "",
  };

  Object.freeze(segments);

  const transitionMeta: TransitionMeta = {
    phase: "activating",
    ...(fromState && { from: fromState.name }),
    reason: "success",
    replace: true,
    segments,
  };

  Object.freeze(transitionMeta);

  const state: State = {
    name: constants.UNKNOWN_ROUTE,
    params: EMPTY_PARAMS,
    search: EMPTY_SEARCH,
    path,
    transition: transitionMeta,
    context: {},
  };

  Object.freeze(state);

  deps.setState(state);
  deps.emitTransitionSuccess(state, fromState, FROZEN_REPLACE_OPTS);

  return state;
}
