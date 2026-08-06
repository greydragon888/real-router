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
import type {
  NavigationContext,
  NavigationDependencies,
  NavigationPlan,
} from "../types";

/**
 * The orchestration of one navigation, end to end.
 *
 * These were methods on `NavigationNamespace` until the per-navigation state
 * they shared was named (#1607). Nothing here needs `this`: every function is
 * over `(deps, plan)`, and the namespace above is left with what it actually is
 * — the entry points, their fire-and-forget checkpoint, and the DI bag.
 *
 * ⚑ **The `AbortController` is a field of the PLAN (#1684), not of a
 * router-level slot threaded through as a parameter.** The machine adopts the
 * plan on `NAVIGATE`, so the `CANCEL` action reaches the controller through
 * `ctx.inflight` without anything here handing it over — which is what removed
 * the `inFlight` parameter from all four signatures below, and with it the one
 * class whose slot could be released before the commit and leave that action
 * aborting nothing.
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
 * Route an external `opts.signal` abort onto FSM `CANCEL`, for the WHOLE life of
 * the navigation (#1684).
 *
 * The bridge used to be registered inside `finishAsyncNavigation`, which meant
 * it only ever existed for a navigation that PARKED. Everything that aborted
 * before that — every synchronous arc, and the leave dispatch of a guard-free
 * one, which runs before its own promise gets there — reached nobody: the abort
 * was noticed only by `mayCommit`, a `when` predicate that REFUSES the COMPLETE
 * edge without moving the machine, and `routeTransitionError` filters the
 * resulting `TRANSITION_CANCELLED` before any send. The navigation rejected
 * correctly and the machine was never told, so it sat in `LEAVE_APPROVED` with
 * `isLeaveApproved()` lying and route-CRUD silently blocked until the next
 * navigation.
 *
 * ⚑ **Registered BEFORE `startTransition`, and that is the whole point of the
 * placement.** The `NAVIGATE` edge swaps state before its action runs, so a
 * plugin's `onTransitionStart` — which fires inside the announce — already sees
 * `TRANSITION_STARTED`, where `CANCEL` is declared. Register after the announce
 * and that hook is the one entry point left uncovered.
 *
 * Registered AFTER `abortPreviousNavigation`, equally deliberately: that is
 * where an ALREADY-aborted signal is refused (a pre-check, before anything is
 * announced), and where the PREVIOUS navigation's cancellation runs. A bridge
 * standing during either would be answering for a navigation that is not this
 * one.
 *
 * Costs the #307 hot path nothing, structurally rather than by care: a
 * navigation carrying a `signal` is `suspendable` by definition, so разрез А —
 * the arc with no cancellation machinery at all — can never reach this. The
 * caller does the `signal !== undefined` test, so a navigation without one does
 * not even reach the call — and `opts.signal` is read ONCE, at the caller (see
 * `beginTransition`), because `opts` may be accessor- or Proxy-backed.
 */
function bridgeExternalSignal(
  deps: NavigationDependencies,
  plan: NavigationPlan,
  signal: AbortSignal,
): void {
  const onExternalAbort = (): void => {
    // No direct `controller.abort()` here — "FSM CANCEL ⟹ controller aborted"
    // lives in one place (`handleCancel`), which also returns the machine to
    // READY and emits `TRANSITION_CANCEL`, atomically (#1030). `reason` surfaces
    // via the leave signal (#943).
    deps.cancelNavigation(signal.reason);
  };

  plan.detachExternalBridge = () => {
    signal.removeEventListener("abort", onExternalAbort);
  };

  // Stryker disable next-line ObjectLiteral: equivalent — `{ once: true }` is redundant, and for a reason that OUTLIVED the router-level slot: `abort` fires at most once per signal (the DOM abort algorithm returns early when `aborted` is already true), and this listener is explicitly removed on all four settle paths. It is NOT equivalent because the signal is discarded — it belongs to the CALLER and is not (#1684).
  signal.addEventListener("abort", onExternalAbort, {
    // Stryker disable next-line BooleanLiteral: equivalent — `once` redundant, same argument as the ObjectLiteral above.
    once: true,
  });
}

/**
 * Drop the bridge the moment the navigation settles.
 *
 * Every exit has to call this, because the caller's signal OUTLIVES the
 * navigation: it is the application's object, reusable and often long-lived, so
 * a listener left on it would let a later abort cancel a navigation that has
 * nothing to do with it — or keep this plan reachable for as long as the app
 * holds the controller.
 */
function detachExternalBridge(plan: NavigationContext): void {
  plan.detachExternalBridge?.();
  plan.detachExternalBridge = undefined;
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
  toState: State,
  fromState: State | undefined,
  opts: NavigationOptions,
): NavigationPlan {
  abortPreviousNavigation(deps, opts.signal);

  // Read ONCE, and below the pre-check deliberately. `opts` may be accessor- or
  // Proxy-backed (a supported input — `navigate/edge-cases-proxy`), so every
  // read is a call into application code: the two consumers underneath must be
  // told about the SAME signal, or the navigation could be `suspendable` on the
  // strength of one object and bridged onto another. Hoisting it above
  // `abortPreviousNavigation` would additionally move the pre-check's read in
  // front of the previous navigation's cancel listeners, which is a behaviour
  // change and not this one's business.
  const externalSignal = opts.signal;

  // `suspendable` is true only when a synchronous supersede is reachable — an
  // external `opts.signal`, `subscribeLeave` listeners, or a pre-commit plugin
  // listener (`onTransitionStart` / `onTransitionLeaveApprove`); the pure
  // synchronous navigate (none of these) is uncancellable and skips the
  // commit-gate, keeping the #307 hot path perf-neutral.
  const plan: NavigationPlan = {
    toState,
    fromState,
    opts,
    suspendable:
      externalSignal !== undefined ||
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
    // The two OPTIONAL fields, declared rather than left to their first write,
    // so the plan is born in its final shape. Both are written after the
    // literal — `controller` on the async arc, `detachExternalBridge` on every
    // settle (it is cleared unconditionally, so a navigation carrying no signal
    // pays for a bridge it never attached). A write to an absent property
    // transitions the object's hidden class, and the plan is per-navigation, so
    // that happened on EVERY navigation and made every downstream `plan.*` read
    // — `planPhases`, `completeImmediate`, `completeTransition`,
    // `buildTransitionMeta` — polymorphic. Measured on the runner: leaving them
    // out cost 10–27% across every `navigate/*` benchmark (#1693), and 42% on
    // `navigate/sync-baseline` alone. `plan-born-in-final-shape.test.ts` pins it.
    controller: undefined,
    detachExternalBridge: undefined,
  };

  // The bridge stands from here: after the already-aborted pre-check above,
  // before the announce below — the placement is argued in full on
  // `bridgeExternalSignal`, and it is what covers a plugin's
  // `onTransitionStart`. The test is the CALLER's, so разрез А pays a null
  // check on a value it has already loaded rather than a call.
  if (externalSignal) {
    bridgeExternalSignal(deps, plan, externalSignal);
  }

  // The plan IS the payload, and the machine adopts it as this navigation's
  // identity — there is no epoch to read back afterwards (#1648).
  //
  // ⚑ The send's OUTCOME is checked, and that is not belt-and-braces. The
  // NAVIGATE edge is declared on READY / TRANSITION_STARTED / LEAVE_APPROVED
  // only, and user code runs between `canNavigate()` and here — a `stop()` from
  // a `forwardState` interceptor leaves the machine in IDLE, where the send is
  // a table no-op. Such a navigation is BORN DEAD: `TRANSITION_START` never
  // fired, no plugin heard of it, and the machine is not carrying it. Before
  // this line it walked on anyway and was refused at the very end by a
  // coincidence of topology (`COMPLETE` is not declared where it had landed)
  // rather than by anything that had decided it.
  //
  // ⚠ What this does NOT change was measured, not assumed: the outcome is the
  // same rejected `TRANSITION_CANCELLED` either way, and on THAT arc the guards
  // are not asked either way — the liveness fence at the head of `runStep`
  // already stops the walk. What it removes is the WORK a dead navigation does
  // to reach that answer, whose countable part is the `AbortController` the
  // guard branch allocates. So it is pinned by COUNTING, in the manner of
  // `controller-allocation.test.ts`: `born-dead-navigation-1648.test.ts` turns
  // 0 into 1 on removal, and that assertion is its only killer.
  //
  // ⚠ **BORN DEAD is the motivating arc, not the branch.** `FSM.send` returns
  // `this.#state` read AFTER the update, the action and the listeners, so this
  // asks "where is the machine NOW", not "did the edge fire". The one piece of
  // application code inside the `NAVIGATE` action is a `TRANSITION_START`
  // listener, and three things it can do land here too: `stop()`, `dispose()`,
  // and — since the bridge above — aborting the caller's `opts.signal`. (The
  // rest is refused: a reentrant navigate throws `REENTRANT_NAVIGATION`,
  // `replace`/`clear` are logged no-ops while transitioning.) There the announce
  // DID happen, a plugin DID hear it, and a terminal `TRANSITION_CANCEL` has
  // already been emitted.
  //
  // ⚑ On the external-signal arc the refusal is load-bearing beyond the
  // allocation, because `CANCEL` leaves the machine in `READY` and does not
  // clear `ctx.inflight` (#1671) — so BOTH terms of the `runStep` fence are
  // still true and the walk would run the guards of a navigation everyone has
  // been told is over. Measured with this branch neutered, guard arc, abort from
  // `onTransitionStart`: 1 controller and both guards, against 0 and none here.
  // `stop()` gives 1 controller and no guards (the fence catches it), `dispose()`
  // 0 and none (it has torn the guard maps down by then). Pinned by the second
  // `describe` of `born-dead-navigation-1648.test.ts`.
  if (!deps.startTransition(plan)) {
    // The bridge goes whichever of the two arcs this is — the signal belongs to
    // the caller and outlives the navigation either way. NOT "nothing adopted
    // this navigation": on the announce-window arc `beginNavigation` ran and
    // `ctx.inflight` still holds THIS plan, because `CANCEL` deliberately does
    // not clear it.
    detachExternalBridge(plan);

    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
  }

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
  deps.sendLeaveApprove(plan);

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
  toState: State,
  opts: NavigationOptions,
): State | Promise<State> {
  let fromState: State | undefined;
  // Hoisted because the catch below cannot see `plan`, and the error path needs
  // the navigation's IDENTITY — to name its FAIL with, and to ask the machine
  // whether it is still the one in flight. `undefined` means "no navigation was
  // ever announced", which is precisely when a FAIL must not name one, and it is
  // the marker a supersession token used to carry as `myId === 0` (#1648/#1664).
  let nav: NavigationPlan | undefined;

  try {
    fromState = deps.getState();
    opts = forceReplaceFromUnknown(opts, fromState);

    if (isSameNavigation(fromState, opts, toState)) {
      deps.emitTransitionError(toState, fromState, CACHED_SAME_STATES_ERROR);

      return CACHED_SAME_STATES_REJECTION;
    }

    const plan = beginTransition(deps, toState, fromState, opts);

    nav = plan;

    // Post-`startTransition` supersession is caught by `when: mayCommit` on the
    // COMPLETE edge, asked inside `completeTransition`: a `stop()`/`dispose()`
    // from the TRANSITION_START listener leaves the FSM in IDLE/DISPOSED, where
    // COMPLETE is not declared at all, and an aborted external `opts.signal` is
    // read straight off the commit payload. (Async supersession is additionally
    // caught in `finishAsyncNavigation` / the guard pipeline's `isCurrentNav`;
    // a reentrant navigate() is banned — REENTRANT_NAVIGATION.)

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
      const asyncLeave = handleNoGuardsLeave(deps, plan);

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
      const controller = new AbortController();

      // Onto the PLAN, which the machine adopted on NAVIGATE — so the CANCEL
      // action finds it by identity for as long as this navigation is the one
      // in flight, on the synchronous arc exactly as on the asynchronous one.
      plan.controller = controller;
      // The liveness the guard walk is fenced on, and it now asks the SAME
      // three questions `finishAsyncNavigation` asks (#1687). The two closures
      // were one term apart, and that term was the only discriminator for one
      // whole cancellation source:
      //
      //   supersede  → `isCurrentNavigation` false (a newer plan took the slot)
      //   `stop()`   → `isActive()` false (IDLE)
      //   `dispose()`→ both false
      //   external `opts.signal` → BOTH TRUE, and only `aborted` says otherwise
      //
      // `CANCEL` deliberately carries no `update`, so `ctx.inflight` still names
      // this navigation on the way out (#1671), and it lands the machine in
      // `READY`, which is active — so before this term an externally cancelled
      // navigation walked on and kept asking application guards for a decision
      // it had already announced it would not use. The other three sources were
      // stopped all along, which is why this reads as one source rather than a
      // hole: the fence was total over states and blind to the signal.
      //
      // Readable here only since #1684 put the controller on the plan; the
      // asymmetry `handleNavigateError` documents is a DIFFERENT question ("has
      // the machine left my transition", the precondition for `FAIL`) and stays.
      //
      // ⚑ Scope, deliberately: this stops GUARDS. The `subscribeLeave` dispatch
      // is NOT fenced and must not be — a leave listener is documented to fire
      // when the FSM enters `LEAVE_APPROVED` and to receive a signal that aborts
      // on cancellation (INVARIANTS `subscribeLeave` 8/9), i.e. being called
      // with `aborted === true` is its contract, not a leak.
      const isCurrentNav = () =>
        deps.isCurrentNavigation(plan) &&
        deps.isActive() &&
        !controller.signal.aborted;

      const signal = controller.signal;

      const emitLeaveApproveCallback = (): Promise<void> | undefined => {
        deps.sendLeaveApprove(plan);

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
        return finishAsyncNavigation(deps, guardCompletion, plan, controller);
      }

      if (!isCurrentNav()) {
        throw new RouterError(errorCodes.TRANSITION_CANCELLED);
      }

      // ⚑ Nothing to release. The controller dies with the plan, and the plan
      // stays in `ctx.inflight` until `COMPLETE` clears it — which is the whole
      // point: releasing here used to null the slot BEFORE the commit, so a
      // `stop()` from the post-leave guard-factory window (#1611) sent CANCEL
      // into an empty slot and the abort arrived after its own emit.
    }

    // ⚑ The #1169 external commit-gate stood HERE and is gone, absorbed by
    // `when: mayCommit` on the COMPLETE edge. Both of its clauses are that
    // condition now: a `stop()`/`dispose()` from a listener leaves the machine
    // in IDLE/DISPOSED, where COMPLETE is not declared, and an aborted external
    // `opts.signal` is read straight off the commit payload.
    //
    // Proven by two-sided mutation, not by reading: removing it alone left
    // 3897/3897 green, removing it together with the ask red eight tests across
    // `commit-gate-1169` and the then-live `commit-after-teardown-1611`. (That
    // second file retired with #1649, when the factory it exercised stopped
    // running inside the cleanup; `guard-factory-compiled-once-1649` took over.)

    const finalState = completeTransition(deps, plan);

    // Settled synchronously — the caller's signal outlives this navigation, so
    // its bridge must not.
    detachExternalBridge(plan);

    // A bare `State`, not `Promise.resolve(state)` — the RETURN TYPE is what
    // announces "this navigation already settled, synchronously", which used
    // to be `lastSyncResolved`'s job. The ordering hazard the flag carried is
    // gone with it: there is no window in which a value says "resolved" while
    // `completeTransition` may still throw, because the value only exists once
    // it returned. The Promise wrap moves up to the facade, which owes callers
    // `Promise<State>`; the allocation is the same one, one frame higher.
    return finalState;
  } catch (error) {
    const outcome = handleNavigateError(deps, error, { nav, fromState });

    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- preserve original throw shape from guards or transition pipeline
    return Promise.reject(outcome);
  }
}

async function finishAsyncNavigation(
  deps: NavigationDependencies,
  guardCompletion: Promise<void>,
  nav: NavigationContext,
  controller: AbortController,
): Promise<State> {
  const isActive = () =>
    deps.isCurrentNavigation(nav) &&
    !controller.signal.aborted &&
    deps.isActive();

  const externalSignal = nav.opts.signal;
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
    // ⚑ No bridge is registered here any more (#1684). It used to be, and that
    // was the defect: a navigation that never parked never got one. The bridge
    // now stands from `beginTransition` — before the announce — so by the time
    // this function is entered it has been live for the whole synchronous run
    // that preceded it.
    //
    // The already-aborted check stays. Reaching here with an aborted signal
    // means the bridge fired during that run and the machine has already
    // cancelled; refusing right away carries the caller's own `reason` into the
    // rejection instead of waiting for the post-race check to synthesize one.
    if (externalSignal?.aborted) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED, {
        reason: externalSignal.reason,
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

    routeTransitionError(deps, outcome, nav.fromState, nav);

    throw outcome;
    // NB: emptying the `finally` is NOT equivalent any more (#1684). It used to
    // be, because the abort it skipped was defence-in-depth behind the CANCEL
    // action and the success arm only dropped a reference. Now this IS the abort
    // for every failure the machine never hears about — a rejecting guard, a
    // leave listener that threw — so removing it leaves a captured leave signal
    // unaborted on a navigation that failed.
  } finally {
    // NOT redundant: the signal belongs to the CALLER and outlives the
    // navigation, so a listener left on it would let a later abort cancel an
    // unrelated navigation.
    detachExternalBridge(nav);

    // Detach the abort-race listener before the release below aborts the
    // controller below, so the cleanup abort cannot re-fire it. `undefined`
    // only when the controller was already aborted at setup (the early-resolve
    // branch above registered no listener).
    if (onInternalAbort) {
      controller.signal.removeEventListener("abort", onInternalAbort);
    }

    // Success drops the controller without aborting (the subscribeLeave signal
    // must stay unaborted, #722); cancel/error aborts it with the originating
    // reason so captured signals expose the real cause via `signal.reason`
    // (#943). `abort()` is idempotent, so a controller the CANCEL action has
    // already aborted keeps its first — also meaningful — reason.
    if (!succeeded) {
      controller.abort(failureReason);
    }
  }
}

/**
 * What a failed navigation still knows about itself.
 *
 * These two are mirrored OUTSIDE the `try` on purpose — `plan` is declared
 * inside it, so a throw from the prologue (before `beginTransition` returns)
 * leaves nothing else to report with, and `nav === undefined` is precisely how
 * the handler asks "did this navigation ever announce itself". Grouping them is
 * what keeps the handler at five parameters instead of six, and it is FREE:
 * the object is built in the `catch`, so the happy path allocates nothing.
 */
interface AttemptedNavigation {
  /**
   * The navigation itself — the plan object the machine adopted, which is what
   * a FAIL names (#1648). `undefined` when the throw came from the prologue,
   * before the navigation was announced.
   */
  readonly nav: NavigationContext | undefined;
  readonly fromState: State | undefined;
}

/**
 * Settle a failed navigation on the SYNCHRONOUS arc: abort its controller,
 * report it only while it is still the navigation in flight, and hand back the
 * outcome the caller's promise should carry.
 *
 * `nav === undefined` means `TRANSITION_START` never fired, so there is no
 * announced navigation for a terminal event to pair with — the error goes back
 * untouched. It is written in one breath once `beginTransition` has returned,
 * which is what the numeric token it replaced did with `0`. Testing the
 * navigation itself is what lets the report NAME it without an assertion
 * (#1648).
 *
 * Liveness asks the precise question — **does the FSM still hold MY
 * transition?** — because that is the precondition for sending `FAIL` at all:
 * the identity says no newer navigation took over, and `isTransitioning()` says the
 * FSM has not already left the transition band. `isActive()` would be the looser
 * approximation and gets two cases wrong: a listener that runs `stop()` followed
 * by a `start()` PARKED in an async interceptor bumps no token and puts the FSM
 * in `STARTING`, where `isActive()` is true again — for a different lifecycle,
 * whose start the stale `FAIL` would then kill (`STARTING --FAIL--> IDLE`).
 * `#finishAsyncNavigation` reads the same fact off `controller.signal.aborted`.
 * ⚠ That used to be a fact this arc COULD NOT read — the guard-free leave arc
 * kept its controller local and had already released it by the time an error
 * arrived here — and since #1684 it can (`nav.controller`). The asymmetry is
 * therefore no longer forced by availability, and it stays on its own merit:
 * "has the FSM left my transition" is the precondition for `FAIL`, which is a
 * different question from "was my signal aborted". Swapping this arc onto the
 * signal is a behaviour change and has not been measured — do not do it as
 * tidying.
 *
 * ⚑ NOT interim any more — see `asCancellation` in `./errorHandling` for the
 * measurement. The table absorbed the two halves #1609 was written against; the
 * arc this check guards is a THIRD one it does not reach, because
 * `STARTING --FAIL--> IDLE` names no navigation to refuse.
 */
function handleNavigateError(
  deps: NavigationDependencies,
  error: unknown,
  attempted: AttemptedNavigation,
): unknown {
  const { nav } = attempted;

  if (nav) {
    detachExternalBridge(nav);
  }

  // The failing navigation's OWN controller, read off the navigation itself
  // (#1684). It used to be a hoisted local, set only in the guard branch — so
  // the guard-free leave arc, whose controller was local to
  // `handleNoGuardsLeave`, reached here with `null` and its captured leave
  // signal was left unaborted on a navigation that had just rejected. Reading
  // the plan covers both arcs, and `undefined` is exactly the born-dead case:
  // no navigation was announced, so there is nothing to abort.
  nav?.controller?.abort(error);

  if (nav !== undefined) {
    const outcome =
      deps.isCurrentNavigation(nav) && deps.isTransitioning()
        ? error
        : asCancellation(error);

    routeTransitionError(deps, outcome, attempted.fromState, nav);

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
  plan: NavigationPlan,
): Promise<State> | undefined {
  const { toState, fromState } = plan;

  deps.sendLeaveApprove(plan);

  if (deps.hasLeaveListeners()) {
    const controller = new AbortController();

    // Put on the plan BEFORE listeners run so a reentrant navigate() / stop() /
    // dispose() from a sync listener aborts THIS leave signal — parity with
    // the guard path (#722).
    plan.controller = controller;

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
      // `handleNavigateError` would abort it too, with the same value and
      // idempotently; kept here because this is where the reason is KNOWN to be
      // the thrown one, and the three pins in `leave-signal-cancellation.test.ts`
      // are about that, not about the unwind.
      controller.abort(error);

      throw error;
    }

    if (leaveResult !== undefined) {
      return finishAsyncNavigation(deps, leaveResult, plan, controller);
    }

    // Sync listeners settled. Nothing to release: the controller belongs to the
    // plan and the plan is still the navigation in flight, which is what lets a
    // cancellation between here and the commit still reach it (#1684). Success
    // never aborts it, so the captured leave signal stays live (#722).
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
