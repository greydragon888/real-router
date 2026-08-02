import { abortPreviousNavigation } from "./executeNavigation";
import {
  EMPTY_PARAMS,
  EMPTY_SEARCH,
  constants,
  errorCodes,
} from "../../../constants";
import { RouterError } from "../../../RouterError";
import { nameToIDs } from "../../../transitionPath";

import type { NavigationOptions, State, TransitionMeta } from "../../../types";
import type { NavigationDependencies, NotFoundOptions } from "../types";

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
  opts?: NotFoundOptions,
): State {
  // #1186 — liveness gate. This internal commit primitive has no FSM
  // transition of its own, so without this check a `dispose()` that lands
  // while a start-interceptor is parked (FSM already DISPOSED) would let the
  // resuming pipeline commit an UNKNOWN_ROUTE state on the disposed router and
  // `start()` resolve. Symmetric with `navigateToState`'s `canNavigate()` gate
  // (the matched-route branch is already protected).
  //
  // ⚠ Reached ONLY through the INTERNALS door — `getInternals(router)
  // .navigateToNotFound(path)` — never from the facade, whose own `!isActive()`
  // check fires first (measured: facade + stopped throws `ROUTER_NOT_STARTED`,
  // facade + disposed throws `ROUTER_DISPOSED` from the disposal swap; only
  // `getInternals(…)` on a stopped or disposed router lands here). So the
  // callers this gate actually protects against are the internal ones —
  // `replace()`'s revalidation no-match arm is the demonstrated case, and it is
  // why that arm was already safe while the two commit arms beside it were not
  // (#1627).
  //
  // ⚑ The gate MOVED rather than disappeared: it is now the ask half of
  // `systemCommit` below, which refuses on the same states (`SYSTEM_COMMIT` is
  // declared from READY and STARTING only) with the same code. Asking there and
  // not here is what makes it structural — a caller cannot forget it — but the
  // explicit THROW has to stay either way, because a table refusal is silent
  // and the contract promises an error (#1186).
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

  // ⚑ The 404 is a DEPARTURE, and a departure the user can refuse (#1643).
  //
  // "Bypasses the pipeline" used to mean "runs no guards", and only the
  // ACTIVATION half of that follows from being a 404 — there is nothing to
  // activate at `UNKNOWN_ROUTE`, but there is very much something to
  // deactivate. The gap was reachable by pressing Back: the shipped URL
  // plugins call this from their popstate / navigate handlers, so an editor
  // with unsaved changes lost them to any URL that no longer matched a route,
  // with the app's own confirm dialog never shown.
  //
  // Refusing here is what the surrounding handlers ALREADY expect. The
  // matched-route branch beside this one rejects on a blocking guard and its
  // `catch` rolls the URL back; the strict-mode branch throws for the same
  // purpose ("synchronous throw is the rollback signal" — navigation-plugin).
  // The `allowNotFound` branch was the only one that could not refuse, and
  // that asymmetry was the defect.
  //
  // ⚠ The abort above has already happened, deliberately: `navigate` also
  // supersedes before its guards run, so a refused 404 cancels an in-flight
  // navigation exactly as a refused `navigate` does. Matching the established
  // shape beats leaving two orders to reason about.
  //
  // `skipDeactivation` is INTERNAL and has exactly two users, both in
  // `replace()`'s revalidation, both because asking here would be wrong rather
  // than merely redundant: one arm has already put the same question to
  // `canNavigateTo` and been refused, and the other reaches this because the
  // current route no longer exists in the new tree — there is no guard left to
  // consult on a route that is gone.
  if (
    opts?.skipDeactivation !== true &&
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

    throw error;
  }

  // Write AND announce as one table fact — this is the second of the two
  // ruptures of "every channel that changes committed state goes through the
  // machine" (plan §6.1), and closing it is what finally lets `fromState` of
  // the next navigation equal `toState` of the previous one (plan §12.3).
  deps.systemCommit(state, fromState, FROZEN_REPLACE_OPTS);

  return state;
}
