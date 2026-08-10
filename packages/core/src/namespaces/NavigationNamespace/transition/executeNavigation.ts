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
 * Materialise the navigation's `AbortController` — the ONE door, so a
 * cancellation that arrived before the first consumer is not lost (#1706).
 *
 * The controller is allocated lazily and by three different consumers (the
 * guard fork, the guard-free leave arc, and a leave listener registered from
 * inside the announce), and `CANCEL` can land in front of any of them. It has
 * nowhere to abort then, so it records `cancelReason` on the navigation
 * instead and this function replays it onto the controller the moment one
 * exists. Without the replay the fresh controller is born UNABORTED, the
 * liveness fence reads `!signal.aborted` as "still live", and the guards of a
 * navigation that already announced its `TRANSITION_CANCEL` run anyway.
 *
 * Idempotent on purpose: `handleNoGuardsLeave` opens one before the announce
 * and asks again after it, and "the second ask must not replace the signal the
 * listeners were handed" is the #1697 contract.
 */
function openController(plan: NavigationContext): AbortController {
  const existing = plan.controller;

  if (existing !== undefined) {
    return existing;
  }

  const controller = new AbortController();

  // Born aborted when the machine already cancelled this navigation. `reason`
  // is whatever `CANCEL` carried, so a captured signal still exposes the real
  // cause (#943).
  if (plan.cancelReason !== undefined) {
    controller.abort(plan.cancelReason);
  }

  plan.controller = controller;

  return controller;
}

/**
 * SECOND of the bridge's two moments (#1690); the FIRST is the `NAVIGATE`
 * edge's action (#1724). Two because `hasGuards` is unknowable when the edge
 * fires, and registering unconditionally there measured **+23…30 %**.
 *
 * The terms differ in kind. **No signal** is a fast path, NOT protection:
 * `bridgeExternalSignal` refuses it itself (dropping it reds 0 of 4082), it
 * only saves the call — ~1 %. **`cancelReason`**: the machine already
 * cancelled, so a listener installed now is one nothing would remove (4 leaked;
 * `cancellability-scope-1716`). **No guards**: nothing could abort
 * (`bridge-only-when-the-band-can-abort-1690`). No fourth term — "is a bridge
 * standing?" is `bridgeExternalSignal`'s (a duplicate drops coverage), and
 * "already aborted?" is asked once after the announce (`ex:547-551`).
 */
function bridgeLateIfOnlyGuardsCanAbort(
  deps: NavigationDependencies,
  plan: NavigationPlan,
): void {
  if (
    plan.externalSignal === undefined ||
    plan.cancelReason !== undefined ||
    !plan.hasGuards
  ) {
    return;
  }

  deps.bridgeExternalSignal(plan);
}

/**
 * Pass 1 of the shared prologue: reserve the navigation, then announce it.
 *
 * ⚑ **Every value taken from the caller's `opts` arrives as a PARAMETER, and
 * that is what keeps the order of those reads out of this function.** `opts` is
 * accessor- or Proxy-backed by contract, so a read is a call into application
 * code, and the window between the previous navigation's cancel and this one's
 * announce is the one place where such a call is dangerous: a getter starting a
 * nested navigation there parks the machine back in the band, and this
 * navigation's own `send(NAVIGATE)` then takes a self-loop the table documents
 * as never traversed. Reading at the entry — before anything is cancelled or
 * announced — is not a rule to remember any more; there is nothing left here to
 * order. `entry-reads-opts-once.test.ts` keeps it that way.
 *
 * What IS still ordered, and cannot be lifted: `suspendable` reads listener
 * counts, which `abortPreviousNavigation`'s `CANCEL` listeners may change, so
 * it is computed after the cancel — and before `startTransition`, whose own
 * listeners a `stop()` would use to empty the same lists (#1169, the QB/QE
 * hole).
 */
function beginTransition(
  deps: NavigationDependencies,
  toState: State,
  fromState: State | undefined,
  opts: NavigationOptions,
  externalSignal: AbortSignal | undefined,
  abortedAtEntry: AbortSignal | undefined,
  reload: boolean | undefined,
  replace: boolean | undefined,
  redirected: boolean | undefined,
  forceDeactivate: boolean,
): NavigationPlan {
  abortPreviousNavigation(deps, abortedAtEntry);

  // Two of the three halves of "application code runs between the announce and
  // the settle" — the third, `hasGuards`, is unknowable until after the
  // announce, which is what splits the bridge's registration into two moments
  // (#1690). Asked unconditionally because they are also the bridge's predicate.
  const announceOrLeaveCanAbort =
    deps.hasLeaveListeners() || deps.hasPreCommitListeners();

  // `suspendable` is true only when a synchronous supersede is reachable — an
  // external `opts.signal`, `subscribeLeave` listeners, or a pre-commit plugin
  // listener; a navigate with none of these is uncancellable and skips the
  // commit-gate, which is what keeps the #307 hot path perf-neutral.
  //
  // ⚠ **The `externalSignal` term carries the implication "bridge registered ⟹
  // suspendable" (#1705).** Both registration sites require `externalSignal !==
  // undefined`, and `suspendable` repeats the term, so the implication holds.
  // Drop it and a navigation with a guard, a signal and no listeners carries a
  // bridge while being non-suspendable — nothing leaks, and no behavioural test
  // can see it, because the guarantee is two predicates staying coincident.
  // `bridge-implies-suspendable-1705.test.ts` asserts the disjunct by name and
  // holds the registration sites as a closed set; a third site has to re-open
  // that check rather than inherit it.
  const plan: NavigationPlan = {
    toState,
    fromState,
    opts,
    suspendable: externalSignal !== undefined || announceOrLeaveCanAbort,
    forceDeactivate,
    // Write-once placeholders — pass 2 fills them (see `NavigationPlan`).
    toDeactivate: NO_SEGMENTS,
    toActivate: NO_SEGMENTS,
    intersection: "",
    canDeactivateFunctions: NO_GUARDS,
    canActivateFunctions: NO_GUARDS,
    shouldDeactivate: false,
    shouldActivate: false,
    hasGuards: false,
    // The OPTIONAL fields are DECLARED, not left to their first write: the plan
    // is per-navigation, and a write to an absent property transitions its
    // hidden class, making every downstream `plan.*` read polymorphic. Measured
    // on the runner: leaving them out cost 10–27% across every `navigate/*`
    // benchmark and 42% on `navigate/sync-baseline` alone (#1693).
    // `plan-born-in-final-shape.test.ts` pins it.
    controller: undefined,
    cancelReason: undefined,
    detachExternalBridge: undefined,
    externalSignal,
    reload,
    replace,
    redirected,
  };

  // The plan IS the payload, and the machine adopts it as this navigation's
  // identity — there is no epoch to read back afterwards (#1648).
  //
  // ⚑ **The send's OUTCOME is checked, and it asks "where is the machine NOW",
  // not "did the edge fire".** `FSM.send` returns the state read after the
  // update, the action AND the listeners, so two different things land in the
  // branch below: a navigation the table never adopted (BORN DEAD — a `stop()`
  // from a `forwardState` interceptor leaves the machine in IDLE, where the send
  // is a no-op), and one whose own announce moved the machine.
  //
  // Neither changes the OUTCOME — both reject `TRANSITION_CANCELLED` — so what
  // the check removes is work, and on the external-signal arc also a walk: after
  // `CANCEL` the machine sits in `READY` with `ctx.inflight` intact (#1671), so
  // both terms of the `runStep` fence still pass and the guards of a navigation
  // everyone has been told is over would run. Counted, never traced, by
  // `born-dead-navigation-1648.test.ts` — both of its `describe`s.
  if (!deps.startTransition(plan)) {
    // ⚠ Not only the refused-edge case: `FSM.send` reports the state after the
    // action AND the listeners, so a navigation whose announce moved the machine
    // arrives here too (9 of 16 arrivals across the tier). Those DID open a
    // cancellability scope, and the `CANCEL` that moved the machine closed it on
    // the way out — which is why nothing is closed here.
    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
  }

  return plan;
}

/**
 * The uninterruptible navigation, end to end (RFC §5.1, разрез А).
 *
 * Reached only when `!hasGuards && !suspendable`, so the cancellation machinery
 * is not *skipped* here — it is ABSENT: no `AbortController`, no liveness
 * closure, no commit-gate, and the bare `State` return says the rest.
 *
 * ⚠ Only the controller ANNOUNCES itself (`guards-off-path` counts
 * allocations). A liveness closure or a gate added here changes no outcome and
 * reds nothing — both are tautologies on this arc — so the body is scanned
 * instead: `immediate-arc-stays-empty.test.ts` asserts it is exactly these two
 * calls.
 *
 * `LEAVE_APPROVE` stays: every navigation makes that transition, and with no
 * leave listeners there is nothing to await behind it.
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
    !!plan.fromState && !plan.forceDeactivate && toDeactivate.length > 0;
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

    // Read FIRST and once: everything that happens to the signal after this
    // point happened INSIDE the navigation, and must reach it through the
    // machine rather than through a throw.
    const externalSignal = opts.signal;
    const abortedAtEntry =
      externalSignal?.aborted === true ? externalSignal : undefined;

    opts = forceReplaceFromUnknown(opts, fromState);

    // Мета читается ПОСЛЕ форса: он подменяет объект, выставляя `replace: true`.
    const reload = opts.reload;
    const replace = opts.replace;
    const redirected = opts.redirected;
    const forceDeactivate = opts.forceDeactivate === true;

    if (isSameNavigation(fromState, opts, toState)) {
      deps.emitTransitionError(toState, fromState, CACHED_SAME_STATES_ERROR);

      return CACHED_SAME_STATES_REJECTION;
    }

    const plan = beginTransition(
      deps,
      toState,
      fromState,
      opts,
      externalSignal,
      abortedAtEntry,
      reload,
      replace,
      redirected,
      forceDeactivate,
    );

    nav = plan;

    // The scope is open — the machine adopted this plan, so `CANCEL` is
    // declared — and the FIRST thing it does is ADOPT what the caller's signal
    // already says (#1704).
    //
    // `addEventListener` never fires retroactively, so every bridge
    // registration is only as good as the instant it happens — and there is a
    // live window in front of the earliest one: `beginTransition` reads
    // `opts.signal` and `opts.forceDeactivate` between the entry pre-check and
    // the announce, and reading `opts` IS a call into application code when it
    // is accessor- or Proxy-backed (`navigate/edge-cases-proxy`). A getter that
    // aborts there left the bridge standing on a dead signal and the machine
    // never told: no `TRANSITION_CANCEL`, `isLeaveApproved()` stuck true, and
    // `clear()` / `replace()` silently blocked until the next navigation.
    //
    // ⚠ **Here and not beside the registration it protects.** `CANCEL` is
    // declared on `TRANSITION_STARTED` / `LEAVE_APPROVED` only, so asking
    // before the announce is a table no-op that fixes nothing — demonstrated
    // mutationally: moving this above `startTransition` reds the same six tests
    // as deleting it. Asking again later is harmless for the same reason —
    // `sendCancelIfPossible` is `canCancel()`-guarded, so once this has fired
    // the machine is in `READY` and every further cancel is refused rather than
    // re-emitted. That is why neither bridge site carries a copy of the
    // question any more.
    //
    // ⚠ **These four lines are INLINE deliberately — do not tidy them into a
    // helper.** They were a function (`adoptAbortedSignal`) and it measurably
    // cost `navigate/sync-baseline` **13.4 %** on the runner: 8.2720 ms on the
    // base against 9.5540 ms with the helper, and 8.2728 ms with the identical
    // statements inlined — 90 unchanged, 0 regressions. Established by
    // elimination, so the earlier suspects are recorded as ALREADY REFUTED:
    // it is not the plan literal's slot (removing it measured WORSE, 10.0202),
    // not module size (comments stripped both sides: 8.2785 vs 9.8114), not the
    // call's position (moving it into `beginTransition`: 10.1170), not the
    // runner (the base re-measures at 8.2619 six hours apart) and not #1706,
    // which adds `openController` to this same module for free — that one is
    // never called on разрез А, and this is. The mechanism is not understood;
    // the shape that costs nothing is.
    const abortedSignal = plan.externalSignal;

    if (abortedSignal?.aborted === true) {
      deps.cancelNavigation(abortedSignal.reason);
    }

    // Post-`startTransition` supersession is caught by `when: mayCommit` on the
    // COMPLETE edge, asked inside `completeTransition`: a `stop()`/`dispose()`
    // from the TRANSITION_START listener leaves the FSM in IDLE/DISPOSED, where
    // COMPLETE is not declared at all, and an aborted external `opts.signal` is
    // read straight off the commit payload. (Async supersession is additionally
    // caught in `finishAsyncNavigation` / the guard pipeline's `isCurrentNav`;
    // a reentrant navigate() is banned — REENTRANT_NAVIGATION.)

    planPhases(deps, plan);

    bridgeLateIfOnlyGuardsCanAbort(deps, plan);

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
      // Onto the PLAN, which the machine adopted on NAVIGATE — so the CANCEL
      // action finds it by identity for as long as this navigation is the one
      // in flight, on the synchronous arc exactly as on the asynchronous one.
      //
      // ⚑ Through `openController`, not `new` (#1706). A `CANCEL` can already
      // have landed — `bridgeLateIfOnlyGuardsCanAbort` two statements above
      // sends one itself when the caller's signal was aborted in the announce
      // window — and it had no controller to abort. Born unaborted, this one
      // would satisfy `isCurrentNav` below and the walk would ask the guards of
      // a navigation whose `TRANSITION_CANCEL` has already been emitted.
      const controller = openController(plan);
      // The liveness the guard walk is fenced on, and the same pair
      // `finishAsyncNavigation` asks (#1687). `aborted` is the term that
      // DECIDES, on every source; the identity term is the second line, kept
      // for a reason measured rather than assumed (below).
      //
      //   supersede             → identity false, AND aborted
      //   `stop()` / `dispose()`→ aborted (the terminate path cancels first)
      //   external `opts.signal`→ identity TRUE, and only `aborted` says otherwise
      //
      // `CANCEL` deliberately carries no `update`, so `ctx.inflight` still names
      // this navigation on the way out (#1671), and it lands the machine in
      // `READY` — so before the `aborted` term an externally cancelled
      // navigation walked on and kept asking application guards for a decision
      // it had already announced it would not use.
      //
      // ⚑ **A third term, `deps.isActive()`, stood here until #1734 and was
      // removed as unreachable — measured, not argued.** Over both tiers it was
      // the deciding term ZERO times in 317 refusals, and it could not be: the
      // ONLY way an in-flight navigation sees a false `isActive()` is as a
      // downstream echo of the very `CANCEL` that already aborted it. `STOP` is
      // not declared on `TRANSITION_STARTED` / `LEAVE_APPROVED`, so `stop()`
      // cannot leave the band without cancelling — with the cancel removed,
      // `sendStop()` from the band is a table no-op and the machine never
      // reaches `IDLE` at all. The one remaining route is the fail-safe
      // band→`DISPOSED` edge, which `dispose()` reaches only after
      // `sendCancelIfPossible`; forced open, it still asks no guard, because
      // `dispose()` has cleared the guard registry by then. Two-sided: with the
      // terminate path stripped of its cancel the tier reds the SAME 39 tests
      // with this term and without it.
      //
      // ⚠ The identity term is NOT in that category and was measured
      // separately. Strip `abortPreviousNavigation`'s cancel — i.e. reach
      // #1681's documented, unenforced hole where a `when` on the `CANCEL` edge
      // makes the `NAVIGATE` self-loop reachable and a supersede adopts a new
      // plan without cancelling the incumbent — and the tier goes 26 red to 30
      // WITHOUT this term. The four it holds include
      // `leave-approve-integration` "the LEAVE_APPROVE event names the
      // SURVIVING navigation", the very test #1670 wrote when it moved that
      // invariant off the table and onto this fence.
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
        deps.isCurrentNavigation(plan) && !controller.signal.aborted;

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

    // ⚑ No detach here any more (#1716). `completeTransition` sends `COMPLETE`,
    // and closing the scope is that edge's ACTION — so the bridge is already
    // gone by the time this returns, one frame deeper and before the
    // `TRANSITION_SUCCESS` emit rather than after it.
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
  // The same pair as the guard walk's fence, and it lost the same third term
  // for the same measured reason (#1734) — see the comment above `isCurrentNav`
  // in `executeNavigation`'s guard branch, which is where that one is built and
  // not `beginTransition`. `deps.isActive()` never decided here either: a false
  // one for a navigation still in flight is an echo of the `CANCEL` that
  // aborted it, never an independent detector. The local kept that name until
  // #1734 too, and it had been wrong for longer than the term was redundant.
  const isCurrentNav = () =>
    deps.isCurrentNavigation(nav) && !controller.signal.aborted;

  // The SAME object the bridge was attached to, not a re-read of
  // `nav.opts.signal` (#1690). With a Proxy-backed `opts` the second read can
  // hand back a different signal, and this pre-check would then be asking a
  // stranger whether this navigation was cancelled.
  const externalSignal = nav.externalSignal;
  let onInternalAbort: (() => void) | undefined;
  let succeeded = false;
  let failureReason: unknown;

  // #1018: race the guard completion against the controller's abort so a
  // non-cooperative guard whose Promise never settles (and ignores `signal`)
  // cannot wedge navigate() forever. `abortRace` RESOLVES on abort, so the
  // post-race `isCurrentNav()` check below throws TRANSITION_CANCELLED — the same
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
    // now stands from the `NAVIGATE` edge's action (#1724) — before the announce
    // that action emits — so by the time this function is entered it has been
    // live for the whole synchronous run that preceded it.
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

    if (!isCurrentNav()) {
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
    const outcome = isCurrentNav() ? error : asCancellation(error);

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
    // ⚑ The external bridge is NOT detached here any more (#1716) — every way
    // out of this function goes through a terminal edge, whose action closes the
    // scope: success sends `COMPLETE`, a reportable failure sends `FAIL` through
    // `routeTransitionError`, and a `TRANSITION_CANCELLED` outcome is by
    // definition one the machine already heard as `CANCEL` (all three sources of
    // a false `isCurrentNav()` — supersede, `stop()`/`dispose()`, an aborted
    // `opts.signal` — reach the table through it). Verified by instrumenting the
    // whole tier: of the 15 arrivals here with a live bridge, 14 were closed by
    // `CANCEL` and 1 by `COMPLETE`, none by this line.
    //
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

  // ⚑ No detach here any more (#1716). This handler either REPORTS the failure —
  // `routeTransitionError` below sends `FAIL`, whose action closes the scope —
  // or restates it as a cancellation, which is only reachable when the machine
  // has already left this navigation's band through `CANCEL`. The one arrival
  // that used to depend on this line was an ORDERING artifact of it standing
  // above the report rather than below: measured, `isCurrent` and
  // `isTransitioning` were both true there, i.e. `FAIL` was sent four statements
  // later.

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

  // ⚑ The controller has to EXIST before the announce, not after it (#1697).
  // A plugin's `onTransitionLeaveApprove` — or a raw TRANSITION_LEAVE_APPROVE
  // listener — can cancel from inside `sendLeaveApprove`, and `handleCancel`
  // aborts whatever `ctx.inflight.controller` holds AT THAT MOMENT. Allocated
  // after the announce it was a fresh, unaborted controller, so the listeners
  // below were handed a live signal for a navigation that had already had its
  // `TRANSITION_CANCEL` — and the two shared primitives that make being called
  // after a cancel safe are keyed on exactly that flag (`guardLeaveListener`
  // arm 2, behind `useRouteExit` in all six adapters, and the reentrant-abort
  // return in `dom-utils/view-transitions`), so both were bypassed. The guard
  // arc never had this: there the controller is on the plan before the walk,
  // i.e. before any announce.
  //
  // Still gated on `hasLeaveListeners()`, and that gate stays: разрез А — no
  // guards and no leave listeners — allocates nothing, and this is the arc
  // where that is decided.
  if (deps.hasLeaveListeners()) {
    openController(plan);
  }

  deps.sendLeaveApprove(plan);

  if (deps.hasLeaveListeners()) {
    // Reuse the one the announce may already have aborted. This allocates only
    // for a listener REGISTERED from inside the announce, which the gate above
    // could not have counted — and since #1706 that late allocation is no
    // longer a hole either: `openController` replays a `cancelReason` the
    // announce recorded, so such a listener is handed an already-aborted signal
    // like every other one.
    const controller = openController(plan);

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
  abortedAtEntry: AbortSignal | undefined,
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

  // Refuse without announcing ONLY for a signal that was already dead when the
  // router received it: nothing has been announced, so nothing is owed a
  // terminal event (`external-signal-bridge-1684`). An abort that lands LATER —
  // from an `opts` getter, during the prologue — is a cancellation OF this
  // navigation, and the caller is owed the pair: the announce, then `CANCEL`.
  // The entry read is what tells the two apart; asking `aborted` here instead
  // conflated them, and four of the five `opts` fields silently took the
  // refusal path.
  if (abortedAtEntry !== undefined) {
    throw new RouterError(errorCodes.TRANSITION_CANCELLED, {
      reason: abortedAtEntry.reason,
    });
  }
}
