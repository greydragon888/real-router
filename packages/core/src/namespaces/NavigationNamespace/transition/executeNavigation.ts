import { completeTransition } from "./completeTransition";
import { asCancellation, routeTransitionError } from "./errorHandling";
import { executeGuardPipeline } from "./guardPhase";
import { errorCodes, constants } from "../../../constants";
import { RouterError } from "../../../RouterError";
import { getTransitionPath } from "../../../transitionPath";
import {
  CACHED_SAME_STATES_ERROR,
  CACHED_SAME_STATES_REJECTION,
} from "../constants";

import type { GuardFn, NavigationOptions, State } from "../../../types";
import type { InFlightNavigation } from "../InFlightNavigation";
import type {
  NavigationContext,
  NavigationDependencies,
  NavigationPlan,
} from "../types";

/**
 * The orchestration of one navigation, end to end.
 *
 * These were methods on `NavigationNamespace` until the per-navigation state
 * they shared was named (#1607). With the controller and the supersession token
 * owned by {@link InFlightNavigation}, nothing here needs `this`: every function
 * is over `(deps, inFlight, plan)`, and the namespace above is left with what it
 * actually is — the entry points, their fire-and-forget checkpoint, and the DI
 * bag.
 *
 * Parameter lists stay flat rather than growing a context object: the plan IS
 * the per-navigation bag already (`NavigationPlan` extends `NavigationContext`),
 * and a second one would be an allocation on the #307 hot path — the same reason
 * `guardPhase.ts` carries its own flat signatures.
 */

// Write-once placeholders for `NavigationPlan`'s pass-2 fields. Module-level so
// building a plan allocates nothing beyond the plan itself; never mutated —
// `planPhases` overwrites the SLOTS, it does not write through them.
const NO_SEGMENTS: string[] = Object.freeze([]) as unknown as string[];
const NO_GUARDS = new Map<string, GuardFn>();

function forceReplaceFromUnknown(
  opts: NavigationOptions,
  fromState: State | undefined,
): NavigationOptions {
  return fromState?.name === constants.UNKNOWN_ROUTE && !opts.replace
    ? { ...opts, replace: true }
    : opts;
}

function isSameNavigation(
  fromState: State | undefined,
  opts: NavigationOptions,
  toState: State,
): boolean {
  return (
    !!fromState &&
    !opts.reload &&
    !opts.force &&
    fromState.path === toState.path
  );
}

/**
 * Does any segment this phase walks carry a guard?
 *
 * The empty-Map check first, so a router with no guards at all pays one load —
 * and a router that HAS guards pays one `Map.has` per segment on the path,
 * against the ~40 ns + 482 B an AbortController costs when the answer is no.
 */
function hasGuardOnPath(
  guards: Map<string, GuardFn>,
  segments: string[],
): boolean {
  if (guards.size === 0) {
    return false;
  }

  for (const segment of segments) {
    if (guards.has(segment)) {
      return true;
    }
  }

  return false;
}

/**
 * Pass 1 of the shared prologue: reserve the navigation, then announce it.
 *
 * Ends with `startTransition` DELIBERATELY, and nothing follows it here. That
 * makes "this threw" strictly equivalent to "TRANSITION_START never fired", so
 * the caller can set its `transitionStarted` marker immediately after the call
 * and stay exactly as accurate as the inline version was.
 *
 * The three statements before it are ordered, not incidental:
 * `#abortPreviousNavigation` may run FSM `CANCEL` (whose listeners can add or
 * drop subscriptions), so `suspendable` has to be read after it — and before
 * `startTransition`, whose listeners a `stop()` would use to empty those same
 * lists (#1169, the QB/QE hole).
 */
function beginTransition(
  deps: NavigationDependencies,
  inFlight: InFlightNavigation,
  toState: State,
  fromState: State | undefined,
  opts: NavigationOptions,
): NavigationPlan {
  abortPreviousNavigation(deps, opts.signal);

  const myId = inFlight.begin();

  // `suspendable` is true only when a synchronous supersede is reachable — an
  // external `opts.signal`, `subscribeLeave` listeners, or a pre-commit plugin
  // listener (`onTransitionStart` / `onTransitionLeaveApprove`); the pure
  // synchronous navigate (none of these) is uncancellable and skips the
  // commit-gate, keeping the #307 hot path perf-neutral.
  const plan: NavigationPlan = {
    toState,
    fromState,
    opts,
    myId,
    suspendable:
      opts.signal !== undefined ||
      deps.hasLeaveListeners() ||
      deps.hasPreCommitListeners(),
    // Write-once placeholders — pass 2 fills them (see `NavigationPlan`).
    toDeactivate: NO_SEGMENTS,
    toActivate: NO_SEGMENTS,
    intersection: "",
    canDeactivateFunctions: NO_GUARDS,
    canActivateFunctions: NO_GUARDS,
    shouldDeactivate: false,
    shouldActivate: false,
    hasGuards: false,
    // Written below: the epoch does not exist until the NAVIGATE update ran.
    myEpoch: 0,
  };

  deps.startTransition(toState, fromState);

  // Read AFTER `startTransition`, because that is what runs the NAVIGATE update
  // that bumps it. Safe to read synchronously: a reentrant navigate is banned
  // (RFC navigation-cancellation-unification §4), so nothing can bump it again
  // between the send and this line.
  plan.myEpoch = deps.getNavigationEpoch();

  return plan;
}

/**
 * The uninterruptible navigation, end to end (RFC §5.1, разрез А).
 *
 * Reached only when `!hasGuards && !suspendable` — no guards to run, no
 * `subscribeLeave` listener, no caller `signal`, no pre-commit plugin
 * listener. Nothing can cancel it and nothing in it can suspend, so the
 * cancellation machinery is not *skipped* here: it is ABSENT. No
 * `AbortController`, no `isCurrentNav` closure, no commit-gate, and the return
 * type is a plain `State` rather than a Promise — being unable to suspend is a
 * property of the code, not a fact one has to remember.
 *
 * The `LEAVE_APPROVE` emit stays: it is an FSM transition every navigation
 * makes, and with no leave listeners there is nothing to await behind it.
 */
function completeImmediate(
  deps: NavigationDependencies,
  plan: NavigationPlan,
): State {
  deps.sendLeaveApprove(plan.myEpoch, plan.toState, plan.fromState);

  return completeTransition(deps, plan);
}

/**
 * Pass 2: work out the shape of the transition, now that it is announced.
 *
 * Runs AFTER `startTransition` because a `TRANSITION_START` listener may still
 * register a guard, and the guard maps must reflect that.
 */
function planPhases(deps: NavigationDependencies, plan: NavigationPlan): void {
  const [canDeactivateFunctions, canActivateFunctions] =
    deps.getLifecycleFunctions();

  const { toDeactivate, toActivate, intersection } = getTransitionPath(
    plan.toState,
    plan.fromState,
    (name) => deps.getMetaForState(name),
  );

  plan.canDeactivateFunctions = canDeactivateFunctions;
  plan.canActivateFunctions = canActivateFunctions;
  plan.toDeactivate = toDeactivate;
  plan.toActivate = toActivate;
  plan.intersection = intersection;
  plan.shouldDeactivate =
    !!plan.fromState && !plan.opts.forceDeactivate && toDeactivate.length > 0;
  plan.shouldActivate =
    plan.toState.name !== constants.UNKNOWN_ROUTE && toActivate.length > 0;
  // The guards of THIS transition, not of the router. Asking the Maps for
  // their size answered a different question — "does the app have a guard
  // anywhere" — so one `canActivate` on an admin page armed the cancellation
  // machinery for every public navigation: an AbortController, the liveness
  // closure, and a walk that found no guard on any of its steps (measured:
  // +643 B and +84 ns per navigation that never touches the guarded route).
  //
  // The predicate mirrors what the interpreter would actually do — a phase
  // whose short-circuit is false runs no step, so its guards cannot fire —
  // which is what keeps this a fast-path gate and not a second policy.
  plan.hasGuards =
    (plan.shouldDeactivate &&
      hasGuardOnPath(canDeactivateFunctions, toDeactivate)) ||
    (plan.shouldActivate && hasGuardOnPath(canActivateFunctions, toActivate));
}

export function executeNavigation(
  deps: NavigationDependencies,
  inFlight: InFlightNavigation,
  toState: State,
  opts: NavigationOptions,
): State | Promise<State> {
  let fromState: State | undefined;
  // The token of the navigation THIS call announced — `0` until `beginTransition`
  // returns, i.e. exactly the "did TRANSITION_START fire?" marker this used to be
  // a boolean for. It carries the id because the error path needs both facts: it
  // may only report for a navigation that was announced AND is still the one in
  // flight (#1609).
  let myId = 0;
  // Hoisted for the same reason as `myId`: the catch below cannot see `plan`,
  // and the error path needs the epoch to stamp its FAIL with.
  let myEpoch = 0;
  let controller: AbortController | null = null;

  try {
    fromState = deps.getState();
    opts = forceReplaceFromUnknown(opts, fromState);

    if (isSameNavigation(fromState, opts, toState)) {
      deps.emitTransitionError(toState, fromState, CACHED_SAME_STATES_ERROR);

      return CACHED_SAME_STATES_REJECTION;
    }

    const plan = beginTransition(deps, inFlight, toState, fromState, opts);

    myId = plan.myId;
    myEpoch = plan.myEpoch;

    // Post-`startTransition` supersession is now caught at the commit-gate
    // below (before `completeTransition`'s setState): a `stop()`/`dispose()`/
    // external-abort from the TRANSITION_START listener leaves the FSM in
    // IDLE/DISPOSED, which `!deps.isActive()` detects. (Async supersession is
    // additionally caught in `#finishAsyncNavigation` / the guard pipeline's
    // `isCurrentNav`; a reentrant navigate() is banned — REENTRANT_NAVIGATION.)

    planPhases(deps, plan);

    // Разрез А (RFC §5.1). `immediate` is the RFC's four-term predicate
    // written in the terms that already exist: `suspendable` IS
    // `signal || leaveListeners || preCommitListeners`, so the whole thing is
    // `!hasGuards && !suspendable`. Nothing can interrupt such a navigation and
    // nothing in it can suspend, so the machinery for both is not skipped —
    // `#completeImmediate` does not contain it.
    //
    // Decided HERE and not at the entry point, deliberately: `hasGuards` is
    // only knowable after `startTransition`, because a `TRANSITION_START`
    // listener may still register a guard. Hoisting the read would change
    // behaviour, not just shape.
    if (!plan.hasGuards && !plan.suspendable) {
      return completeImmediate(deps, plan);
    }

    const {
      canDeactivateFunctions,
      canActivateFunctions,
      toDeactivate,
      toActivate,
      shouldDeactivate,
      shouldActivate,
      hasGuards,
    } = plan;

    const confirmedToState = toState;

    if (!hasGuards) {
      const asyncLeave = handleNoGuardsLeave(deps, inFlight, plan);

      if (asyncLeave !== undefined) {
        return asyncLeave;
      }
    }

    // NOT equivalent, and the `Stryker disable: equivalent` that used to sit
    // here was wrong: with `if (true)` the guard branch runs AFTER
    // `#handleNoGuardsLeave` already emitted LEAVE_APPROVE, so
    // `emitLeaveApproveCallback` dispatches every `subscribeLeave` listener a
    // SECOND time (measured: 2 calls, 1 expected). The whole suite stayed
    // green because the shared `createTestRouter` fixture carries definition
    // guards, so no test ever reached this branch with `hasGuards` false —
    // `guard-phase-emit-leave-approve.test.ts` now builds a guard-free router
    // and kills both mutants.
    // eslint-disable-next-line unicorn/prefer-else-if -- two exhaustive `if`s read clearer here than an else-if; merging cascades into no-negated-condition / no-unnecessary-condition in this hot guard-setup branch
    if (hasGuards) {
      controller = new AbortController();
      inFlight.adopt(controller);
      const isCurrentNav = () => inFlight.isCurrent(myId) && deps.isActive();

      const signal = controller.signal;

      const emitLeaveApproveCallback = (): Promise<void> | undefined => {
        deps.sendLeaveApprove(plan.myEpoch, confirmedToState, fromState);

        if (deps.hasLeaveListeners()) {
          return deps.awaitLeaveListeners(confirmedToState, fromState, signal);
        }

        return undefined;
      };

      const guardCompletion = executeGuardPipeline(
        canDeactivateFunctions,
        canActivateFunctions,
        toDeactivate,
        toActivate,
        shouldDeactivate,
        shouldActivate,
        toState,
        fromState,
        signal,
        isCurrentNav,
        emitLeaveApproveCallback,
      );

      if (guardCompletion !== undefined) {
        // The plan IS the `NavigationContext` (a superset of it), so the
        // second literal this used to build is gone — one bag per navigation.
        return finishAsyncNavigation(
          deps,
          inFlight,
          guardCompletion,
          plan,
          controller,
          myId,
        );
      }

      if (!isCurrentNav()) {
        throw new RouterError(errorCodes.TRANSITION_CANCELLED);
      }

      inFlight.release(controller, false);
    }

    // ⚑ The #1169 external commit-gate stood HERE and is gone, absorbed by
    // `when: mayCommit` on the COMPLETE edge. Both of its clauses are that
    // condition now: a `stop()`/`dispose()` from a listener leaves the machine
    // in IDLE/DISPOSED, where COMPLETE is not declared, and an aborted external
    // `opts.signal` is read straight off the commit payload.
    //
    // Proven by two-sided mutation, not by reading: removing it alone leaves
    // 3897/3897 green, removing it together with the ask reds eight tests
    // across `commit-gate-1169` and `commit-after-teardown-1611`.

    const finalState = completeTransition(deps, plan);

    // A bare `State`, not `Promise.resolve(state)` — the RETURN TYPE is what
    // announces "this navigation already settled, synchronously", which used
    // to be `lastSyncResolved`'s job. The ordering hazard the flag carried is
    // gone with it: there is no window in which a value says "resolved" while
    // `completeTransition` may still throw, because the value only exists once
    // it returned. The Promise wrap moves up to the facade, which owes callers
    // `Promise<State>`; the allocation is the same one, one frame higher.
    return finalState;
  } catch (error) {
    const outcome = handleNavigateError(
      deps,
      inFlight,
      error,
      controller,
      myId,
      myEpoch,
      toState,
      fromState,
    );

    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- preserve original throw shape from guards or transition pipeline
    return Promise.reject(outcome);
  }
}

async function finishAsyncNavigation(
  deps: NavigationDependencies,
  inFlight: InFlightNavigation,
  guardCompletion: Promise<void>,
  nav: NavigationContext,
  controller: AbortController,
  myId: number,
): Promise<State> {
  const isActive = () =>
    inFlight.isCurrent(myId) && !controller.signal.aborted && deps.isActive();

  const externalSignal = nav.opts.signal;
  let onExternalAbort: (() => void) | undefined;
  let onInternalAbort: (() => void) | undefined;
  let succeeded = false;
  let failureReason: unknown;

  // #1018: race the guard completion against the controller's abort so a
  // non-cooperative guard whose Promise never settles (and ignores `signal`)
  // cannot wedge navigate() forever. `abortRace` RESOLVES on abort, so the
  // post-race `isActive()` check below throws TRANSITION_CANCELLED — the same
  // path that already handles a guard which swallows the abort and resolves
  // `true`. `stop()`/`dispose()`/supersede all abort the controller. Mirrors
  // the leave-path protection `settleLeavePromises` (#663/#673).
  const abortRace = new Promise<void>((resolve) => {
    if (controller.signal.aborted) {
      resolve();

      return;
    }

    onInternalAbort = () => {
      resolve();
    };

    controller.signal.addEventListener("abort", onInternalAbort, {
      once: true,
    });
  });

  // Consume `guardCompletion` when the abort wins the race: a slow or
  // never-settling guard that settles later then has no awaiter, which would
  // surface as an unhandled rejection without this catch.
  guardCompletion.catch(() => {
    /* settlement consumed — the race already decided the navigation */
  });

  try {
    if (externalSignal) {
      if (externalSignal.aborted) {
        throw new RouterError(errorCodes.TRANSITION_CANCELLED, {
          reason: externalSignal.reason,
        });
      }

      // Bridge an external `{ signal }` abort onto the internal controller.
      // It is NOT scoped to `controller.signal` (the old `{ signal }` option)
      // because success no longer aborts the controller (#722) — the listener
      // is detached explicitly in `finally` instead.
      onExternalAbort = () => {
        // (#1030): route the external abort through the FSM. The
        // `CANCEL` action aborts the internal controller (waking THIS pipeline)
        // with the external `reason` (#943 — surfaces via the leave signal) AND
        // returns the FSM to READY, atomically. No direct `controller.abort`
        // here — "FSM CANCEL ⟹ controller aborted" lives in one place
        // (handleCancel). onExternalAbort only fires while the navigation is in
        // flight (the listener is removed in `finally` once it settles), so the
        // FSM is always cancellable here.
        deps.cancelNavigation(externalSignal.reason);
      };
      // Stryker disable next-line ObjectLiteral: equivalent — `{ once: true }` is redundant: the per-navigation signal aborts at most once and is discarded unaborted on success, and the `finally` block explicitly removeEventListener's it.
      externalSignal.addEventListener("abort", onExternalAbort, {
        // Stryker disable next-line BooleanLiteral: equivalent — `once` redundant (see ObjectLiteral above); the listener is explicitly removed in `finally`.
        once: true,
      });
    }

    // The race settles two ways and BOTH have to consult liveness. Only this
    // arm did: a rejection throws straight past the check into the `catch`,
    // which is where #1609 lived.
    await Promise.race([guardCompletion, abortRace]);

    if (!isActive()) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    }

    const state = completeTransition(deps, nav);

    succeeded = true;

    return state;
  } catch (error) {
    // Liveness on the OTHER arm of the race (#1609). A guard that rejects one
    // or two microtasks before a superseding `navigate()` used to report FAIL
    // for a navigation cancelled several microtasks earlier —
    // `routeTransitionError` filters by error CODE, and `CANNOT_ACTIVATE` is
    // not `TRANSITION_CANCELLED`. Into a `READY` FSM that was observability
    // noise (a terminal event for a dead navigation); into the LIVE one it was
    // silent corruption, because `TRANSITION_STARTED --FAIL--> READY` is a real
    // edge, so the superseding navigation's later `COMPLETE` became a table
    // no-op: state committed, `TRANSITION_SUCCESS` never emitted, subscribers
    // never notified.
    const outcome = isActive() ? error : asCancellation(error);

    failureReason = outcome;

    routeTransitionError(
      deps,
      outcome,
      nav.toState,
      nav.fromState,
      nav.myEpoch,
    );

    throw outcome;
    // NB: the `} finally {}` BlockStatement mutant SURVIVES but is EQUIVALENT —
    // emptying the finally only skips the controller release, which is unobservable
    // (defense-in-depth: on a CANCEL the FSM CANCEL action already aborted+nulled
    // the controller via abortCurrentController, RFC §5; the success-path
    // ref-release is proven unobservable — see InFlightNavigation.release's disable). It
    // cannot be inline-`Stryker disable`d: the catch `}` and finally `{` share one
    // line, so there is no comment position that targets the finally body. Left documented.
  } finally {
    // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — listener cleanup is redundant: the per-navigation signal is discarded on completion, so skipping the removeEventListener leaks nothing observable.
    if (onExternalAbort) {
      // Stryker disable next-line StringLiteral: equivalent — cleanup event name is redundant (listener is `{ once: true }` and the signal is discarded), so a wrong name removes nothing observable.
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }

    // Detach the abort-race listener before the release below aborts the
    // controller below, so the cleanup abort cannot re-fire it. `undefined`
    // only when the controller was already aborted at setup (the early-resolve
    // branch above registered no listener).
    if (onInternalAbort) {
      controller.signal.removeEventListener("abort", onInternalAbort);
    }

    // Success drops the controller without aborting (the subscribeLeave signal
    // must stay unaborted); cancel/error aborts it with the originating reason
    // so captured signals expose the real cause via `signal.reason` (#943).
    inFlight.release(controller, !succeeded, failureReason);
  }
}

/**
 * Settle a failed navigation on the SYNCHRONOUS arc: release its controller,
 * report it only while it is still the navigation in flight, and hand back the
 * outcome the caller's promise should carry.
 *
 * `myId === 0` means `TRANSITION_START` never fired, so there is no announced
 * navigation for a terminal event to pair with — the error goes back untouched.
 *
 * Liveness asks the precise question — **does the FSM still hold MY
 * transition?** — because that is the precondition for sending `FAIL` at all:
 * the token says no newer navigation took over, and `isTransitioning()` says the
 * FSM has not already left the transition band. `isActive()` would be the looser
 * approximation and gets two cases wrong: a listener that runs `stop()` followed
 * by a `start()` PARKED in an async interceptor bumps no token and puts the FSM
 * in `STARTING`, where `isActive()` is true again — for a different lifecycle,
 * whose start the stale `FAIL` would then kill (`STARTING --FAIL--> IDLE`).
 * `#finishAsyncNavigation` reads the same fact off `controller.signal.aborted`,
 * which this arc cannot: the guard-free leave arc keeps its controller local and
 * has already released it by the time an error arrives here.
 *
 * ⚑ NOT interim any more — see `asCancellation` in `./errorHandling` for the
 * measurement. The table absorbed the two halves #1609 was written against; the
 * arc this check guards is a THIRD one it does not reach, because
 * `STARTING --FAIL--> IDLE` carries no epoch to refuse.
 */
function handleNavigateError(
  deps: NavigationDependencies,
  inFlight: InFlightNavigation,
  error: unknown,
  controller: AbortController | null,
  myId: number,
  myEpoch: number,
  toState: State | undefined,
  fromState: State | undefined,
): unknown {
  if (controller) {
    inFlight.release(controller, true, error);
  }

  if (myId !== 0 && toState) {
    const outcome =
      inFlight.isCurrent(myId) && deps.isTransitioning()
        ? error
        : asCancellation(error);

    routeTransitionError(deps, outcome, toState, fromState, myEpoch);

    return outcome;
  }

  return error;
}

/**
 * The leave phase for a navigation with no guards, but with something that
 * can suspend it. Takes the `plan` whole rather than six projections of it:
 * every argument it used to receive was a field of that same bag, and the bag
 * IS a `NavigationContext`, so handing it straight to `#finishAsyncNavigation`
 * keeps this arc at ONE context object per navigation — the allocation
 * neutrality the extracted prologue was supposed to buy everywhere, not only
 * on the guard path.
 */
function handleNoGuardsLeave(
  deps: NavigationDependencies,
  inFlight: InFlightNavigation,
  plan: NavigationPlan,
): Promise<State> | undefined {
  const { toState, fromState, myId } = plan;

  deps.sendLeaveApprove(plan.myEpoch, toState, fromState);

  if (deps.hasLeaveListeners()) {
    const controller = new AbortController();

    // Adopted BEFORE listeners run so a reentrant navigate() / stop() /
    // dispose() from a sync listener aborts THIS leave signal — parity with
    // the guard path (#722).
    inFlight.adopt(controller);

    let leaveResult: Promise<void> | undefined;

    // This catches the SYNCHRONOUS throw only — a leave listener that throws
    // inline, before any Promise exists (three tests in
    // `leave-signal-cancellation.test.ts` fail without it: the sync-throw
    // rejection, its `signal.reason` (#943), and the reentrant-navigate abort).
    // A rejection of the RETURNED Promise is deliberately not caught here: it is
    // awaited in `finishAsyncNavigation`, which routes it through
    // `routeTransitionError` with the controller released as cancelled. Sonar's
    // S4822 flags the shape (a promise-returning call inside `try`) and cannot
    // see that split.
    try {
      // NOSONAR -- S4822: the try is for the sync listener throw, never for the Promise
      leaveResult = deps.awaitLeaveListeners(
        toState,
        fromState,
        controller.signal,
      );
    } catch (error) {
      // A sync listener threw — the navigation fails; abort the leave signal
      // with the thrown value so a listener that captured the signal sees the
      // real cause via `signal.reason`, not a generic AbortError (#943).
      inFlight.release(controller, true, error);

      throw error;
    }

    if (leaveResult !== undefined) {
      return finishAsyncNavigation(
        deps,
        inFlight,
        leaveResult,
        plan,
        controller,
        myId,
      );
    }

    // Sync listeners settled. A synchronous reentrant navigate() can no longer
    // supersede here (banned, RFC §4), so the leave always succeeds: release the
    // controller WITHOUT aborting (the subscribeLeave signal must stay live).
    inFlight.release(controller, false);

    return undefined;
  }

  // No leave listeners: nothing synchronous could have superseded this
  // navigation during the LEAVE_APPROVE emit (reentrant navigate is banned).
  return undefined;
}

export function abortPreviousNavigation(
  deps: NavigationDependencies,
  externalSignal?: AbortSignal,
): void {
  if (deps.isTransitioning()) {
    deps.logger.warn(
      "router.navigate",
      "Concurrent navigation detected on shared router instance. " +
        "For SSR, use cloneRouter() to create isolated instance per request.",
    );
    // The FSM CANCEL action aborts the previous controller — no
    // direct controller.abort here (RFC navigation-cancellation-unification §5).
    deps.cancelNavigation();
  }

  if (externalSignal?.aborted) {
    throw new RouterError(errorCodes.TRANSITION_CANCELLED, {
      reason: externalSignal.reason,
    });
  }
}
