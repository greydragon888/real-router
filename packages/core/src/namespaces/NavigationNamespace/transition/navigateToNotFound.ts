import { abortPreviousNavigation } from "./executeNavigation";
import {
  EMPTY_PARAMS,
  EMPTY_SEARCH,
  constants,
  errorCodes,
} from "../../../constants";
import { RouterError, freezeThrownError } from "../../../RouterError";
import { nameToIDs } from "../../../transitionPath";

import type { NavigationOptions, State, TransitionMeta } from "../../../types";
import type { NavigationDependencies } from "../types";

// ⚑ Captured at module load — same rule as `helpers.ts`, `materialize.ts` and
// `completeTransition.ts`. Measured with the global neutered: the 404's
// `segments` and its `deactivated` array came back unfrozen. The module-level
// constants below are frozen at import, before any application code runs, so
// they need no capture; these four call sites do.
const freeze = Object.freeze;

/**
 * The one commit primitive that is NOT a transition.
 *
 * It hand-builds an `UNKNOWN_ROUTE` state, freezes it and emits only
 * `TRANSITION_SUCCESS` — no plan, no controller, no activation guards, since
 * there is nothing to activate at `UNKNOWN_ROUTE`. What it DOES share with a
 * navigation is supersession, the departing route's `canDeactivate` (#1643) and
 * the machine: the commit rides a `SYSTEM_COMMIT` edge (#1641).
 */

const FROZEN_ACTIVATED: string[] = Object.freeze([
  constants.UNKNOWN_ROUTE,
]) as unknown as string[];
const FROZEN_REPLACE_OPTS: NavigationOptions = Object.freeze({ replace: true });

function commitNotFound(
  deps: NavigationDependencies,
  path: string,
  consultDeactivation: boolean,
): State {
  // Supersede first, exactly as `navigate` does before its guards run, so a
  // refused 404 cancels an in-flight navigation the same way a refused
  // `navigate` does. No caller signal to pass — this primitive takes none.
  //
  // ⚑ The liveness gate #1186 put here is now the ask half of `systemCommit`
  // below, which makes it structural (a caller cannot forget it) while the
  // explicit throw stays, because a table refusal is silent and the contract
  // promises an error. It is not the same predicate: `SYSTEM_COMMIT` is
  // declared from READY ALONE, so it also refuses in STARTING — a call from
  // inside an async `start` interceptor throws rather than committing.
  abortPreviousNavigation(deps, undefined);

  const fromState = deps.getState();
  const deactivated: string[] = fromState
    ? nameToIDs(fromState.name).toReversed()
    : [];

  freeze(deactivated);

  const segments: TransitionMeta["segments"] = {
    deactivated,
    activated: FROZEN_ACTIVATED,
    intersection: "",
  };

  freeze(segments);

  const transitionMeta: TransitionMeta = {
    phase: "activating",
    ...(fromState && { from: fromState.name }),
    reason: "success",
    replace: true,
    segments,
  };

  freeze(transitionMeta);

  const state: State = {
    name: constants.UNKNOWN_ROUTE,
    params: EMPTY_PARAMS,
    search: EMPTY_SEARCH,
    path,
    transition: transitionMeta,
    context: {},
  };

  freeze(state);

  // ⚑ The 404 is a DEPARTURE, and one the user can refuse (#1643). Only the
  // ACTIVATION half of "bypasses the pipeline" follows from being a 404; the
  // gap was reachable by pressing Back, since the shipped URL plugins call this
  // from their popstate handlers — an editor with unsaved changes lost them to
  // any URL that no longer matched a route, with the app's own confirm dialog
  // never shown. Refusing is what those handlers ALREADY expect: the
  // matched-route branch beside this one rejects and its `catch` rolls the URL
  // back, and the strict-mode branch throws for the same purpose.
  //
  // Which of the two doors called decides this, and the doors are NAMED rather
  // than told apart by a flag (#1981): `revalidateToNotFound` does not consult,
  // for the rule stated at its three call sites in `replace()`'s revalidation
  // (#1652) — a tree swap is not a departure the user chose, so the arms where
  // the route vanished, where the consulted guard refused, and where (#1753)
  // application code removed the route inside the window all skip it alike.
  // ⚠ This does NOT make a later caller of `commitRevalidated` safe — that
  // function IS a revalidation door and anything it calls inherits its lane.
  // What the split removes is the shared door where an ARGUMENT chose the lane:
  // there is no longer a call one can write correctly-looking and get the other
  // behaviour from.
  if (
    consultDeactivation &&
    fromState !== undefined &&
    !deps.canDeactivateCurrent(deactivated, state, fromState)
  ) {
    const error = new RouterError(errorCodes.CANNOT_DEACTIVATE, {
      path,
      message: `[router.navigateToNotFound] a canDeactivate guard on "${fromState.name}" refused to leave for ${path}`,
    });

    // Report before throwing, so an observer sees the refusal on the same
    // channel a blocked `navigate` uses — the popstate handler's own `catch`
    // is written against "navigate() already emitted $$error".
    deps.emitTransitionError(undefined, fromState, error);

    throw freezeThrownError(error);
  }

  // Write AND announce as one table fact — this is the second of the two
  // ruptures of "every channel that changes committed state goes through the
  // machine" (plan §6.1), and closing it is what finally lets `fromState` of
  // the next navigation equal `toState` of the previous one (plan §12.3).
  // The door returns what it COMMITTED, which is not `state` — it copies both
  // channels AND `context`, and builds its own shell (#1792). Returning the argument would hand application code a
  // state the router never holds: value-equal, and not `===` `getState()`.
  return deps.systemCommit(state, fromState, FROZEN_REPLACE_OPTS);
}

/**
 * A user-initiated departure to `UNKNOWN_ROUTE`: the current route's
 * `canDeactivate` is consulted and may refuse (#1643).
 */
export function navigateToNotFound(
  deps: NavigationDependencies,
  path: string,
): State {
  return commitNotFound(deps, path, true);
}

/**
 * The `replace()` revalidation's departure to `UNKNOWN_ROUTE`: `canDeactivate`
 * is NOT consulted, because a tree swap is not a departure the user chose
 * (#1652) and there is no "stay" branch to offer — after the swap the old route
 * may not exist, or may live at another path.
 */
export function revalidateToNotFound(
  deps: NavigationDependencies,
  path: string,
): State {
  return commitNotFound(deps, path, false);
}
