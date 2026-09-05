import { completeTransition } from "./completeTransition";
import { asCancellation, routeTransitionError } from "./errorHandling";
import { executeGuardPipeline } from "./guardPhase";
import { errorCodes, constants } from "../../../constants";
import { adoptNavigationOptions } from "../../../helpers";
import { RouterError, freezeThrownError } from "../../../RouterError";
import { getTransitionPath } from "../../../transitionPath";
import {
  CACHED_SAME_STATES_ERROR,
  CACHED_SAME_STATES_REJECTION,
} from "../constants";

import type { GuardFn, NavigationOptions, State } from "../../../types";
import type {
  AnnouncedPlan,
  NavigationContext,
  NavigationDependencies,
  NavigationPlan,
} from "../types";

/**
 * The orchestration of one navigation, end to end — free functions, no `this`:
 * these were methods until the per-navigation state they shared was named
 * (#1607), and the namespace above is left with what it actually is, the entry
 * points, their fire-and-forget checkpoint and the DI bag.
 *
 * ⚑ The navigation's `AbortController` is a field of the PLAN (#1684) — the
 * machine adopts the plan on `NAVIGATE`, so the `CANCEL` action reaches it
 * through `ctx.inflight` rather than through an injected effect. Inside this
 * file it is still passed by hand where the plan is not enough:
 * `finishAsyncNavigation` takes it as a parameter, from both of its callers.
 */

// Captured at module load, same reason as its six siblings across `src`: the
// freeze below owns a published guarantee — the bag every plugin hook receives —
// and a guarantee is only as strong as the intrinsic it reads WHEN IT RUNS
// (#1970 / #1971).
const freeze = Object.freeze;

// Write-once placeholders for `NavigationPlan`'s pass-2 fields. Module-level so
// building a plan allocates nothing beyond the plan itself; never mutated —
// `planPhases` overwrites the SLOTS, it does not write through them.
const NO_SEGMENTS: string[] = Object.freeze([]) as unknown as string[];
const NO_GUARDS = new Map<string, GuardFn>();

/**
 * The substituting half of the UNKNOWN_ROUTE force, taking the DECISION rather
 * than making it (#1817).
 *
 * Deciding here too — `fromState?.name === UNKNOWN_ROUTE && !opts.replace` —
 * reads the caller's `replace` one read BEFORE the entry hoists it. On a
 * drifting getter the two disagree and the forced replace is LOST: the
 * predicate saw `true` ("the caller already asked, nothing to substitute") while
 * the meta recorded `false`, so a URL plugin reading `transition.replace` pushes
 * a history entry where this mechanism exists to replace one.
 *
 * ⚑ It cannot be dropped in favour of the `replace` that already travels to
 * `beginTransition` as its own positional slot — the reading that filed #1979.
 * That slot is CORE-internal; the BAG is what leaves core, because a plugin's
 * `onTransitionSuccess(toState, fromState, opts)` receives it as the third
 * argument and a history plugin reads `replace` from THERE. Measured by
 * neutralising the substitution: `navigation/navigate/unknown-route.test.ts`
 * reds two cells, both asserting `objectContaining({ replace: true })` on the
 * hook. `opts.replace` is read exactly once in `src`, ABOVE this call, so the
 * static picture really does look redundant — the consumer is out of frame.
 */
function substituteForcedReplace(
  opts: NavigationOptions,
  forced: boolean,
): NavigationOptions {
  if (!forced) {
    return opts;
  }

  // ⚑ Both arms now hand back a frozen record CORE owns, because the entry door
  // ran above this (#1962): the pass-through returns core's own copy, and the
  // spread below re-freezes what the spread thawed. Uniformity is the point —
  // this substitution must not be the reason one arc's hook gets a writable bag.
  //
  // ⚠ `dropUnsafeKey` is gone from here, and its absence is not a relaxation:
  // the source is core's copy, which the entry door already stripped, so a
  // spread of it cannot carry an own `"__proto__"` (#1957). Re-dropping would be
  // an unfalsifiable no-op — the shape #1957's own guard exists to refuse.
  //
  // ⚑ The early return is also what keeps `forced` from being a SELECTOR
  // parameter now that the two arms differ in shape — `sonarjs/no-selector-parameter`
  // fires on the ternary form, and the project's own rule says a boolean
  // argument is a hypothesis to justify.
  return freeze({ ...opts, replace: true });
}

function isSameNavigation(
  fromState: State | undefined,
  reload: boolean | undefined,
  force: boolean | undefined,
  toState: State,
): boolean {
  return !!fromState && !reload && !force && fromState.path === toState.path;
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
 * ⚠ Idempotent, and what that buys is the allocation COUNT, not the signal's
 * identity: `handleNoGuardsLeave` opens one before the announce and asks again
 * after it, and it is the SECOND ask whose signal the leave listeners are
 * handed. Both allocation pins (`controller-allocation`, `guards-off-path`)
 * read 2 without this early return.
 */
function openController(plan: NavigationContext): AbortController {
  const existing = plan.controller;

  if (existing !== undefined) {
    return existing;
  }

  const controller = new AbortController();

  // Born aborted when the machine already cancelled this navigation, with the
  // reason the `CANCEL` action recorded — the sender's own where there is one
  // (an external `opts.signal`, #943), a synthesised `TRANSITION_CANCELLED`
  // where there is not (`stop()` / `dispose()` / supersede).
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
 * `bridgeExternalSignal` refuses it itself (dropping it reds nothing), it
 * only saves the call — ~1 %. **`cancelReason`**: the machine already
 * cancelled, so a listener installed now is one nothing would remove (4 leaked;
 * `cancellability-scope-1716`). **No guards**: nothing could abort
 * (`bridge-only-when-the-band-can-abort-1690`). No fourth term — "is a bridge
 * standing?" is `bridgeExternalSignal`'s (a duplicate drops coverage), and
 * "already aborted?" is asked once, inline right after the announce (#1704) —
 * not here.
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
 * ⚑ **Every value from the caller's `opts` arrives as a PARAMETER**, so the
 * order of those reads is not this function's problem: `opts` is accessor- or
 * Proxy-backed by contract, and the window between the previous navigation's
 * cancel and this one's announce is where such a call is dangerous — a getter
 * starting a nested navigation there parks the machine back in the band, and
 * this `send(NAVIGATE)` then takes a self-loop the table documents as never
 * traversed. `entry-reads-opts-once.test.ts` keeps the reads at the entry.
 *
 * The listener counts behind `suspendable` sit between the cancel and the
 * announce, and only the LOWER boundary is measured: reading them after the
 * announce reds `bridge-implies-suspendable-1705`, reading them above the cancel
 * reds nothing — and a probe for the case that ordering guards (a
 * `subscribeLeave` registered from `onTransitionCancel`) does not separate the
 * two either, since the leave emit asks `hasLeaveListeners()` again in its own
 * moment. After the cancel is the conservative order, not a proven one.
 *
 * ⚑ Hence TEN parameters, and a `NOSONAR` for S107 — the trade `guardPhase`
 * states once at the top of its file, measured here rather than assumed. Six of
 * the ten are those entry reads, and folding them into a bag costs an object
 * literal per navigation on cut A plus bytecode on the `beginTransition` +
 * `planPhases` pair — the pair #1728's model gates the arc on, and it sits close
 * enough to that model's edge that the bag spends real headroom without buying
 * anything. Re-measure with esbuild + `node --no-opt --no-lazy --print-bytecode`
 * before trading on the margin; `--no-lazy` is required or neither function is
 * compiled at all.
 */
function beginTransition( // NOSONAR -- S107: see the note on flat parameters above
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
): AnnouncedPlan {
  abortPreviousNavigation(deps, abortedAtEntry);

  // Two of the three ways application code can run between announce and settle
  // (the third, `hasGuards`, is why the bridge registers in two moments — see
  // `bridgeLateIfOnlyGuardsCanAbort`).
  const announceOrLeaveCanAbort =
    deps.hasLeaveListeners() || deps.hasPreCommitListeners();

  // `suspendable` is true only when a synchronous supersede is reachable — an
  // external `opts.signal`, `subscribeLeave` listeners, or a pre-commit plugin
  // listener; a navigate with none of these is uncancellable, which is what
  // keeps the #307 hot path perf-neutral.
  //
  // ⚠ The `externalSignal` term also carries "bridge registered ⟹ suspendable"
  // (#1705): both registration sites require it, so the two predicates stay
  // coincident. Dropping it leaks nothing and no behavioural test can see it —
  // `bridge-implies-suspendable-1705.test.ts` asserts the disjunct by name and
  // holds the registration sites as a closed set.
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
  // not "did the edge fire".** `FSM.send` reports the state after the update,
  // the action AND the listeners, so two things land in the branch below: a
  // navigation the table never adopted (BORN DEAD — a `stop()` from a
  // `forwardState` interceptor leaves the machine in IDLE), and one whose own
  // announce moved the machine (9 of the tier's 16 arrivals). Neither changes
  // the OUTCOME, so what the check removes is WORK — and since #1706 that work
  // is an ALLOCATION, not a walk: `CANCEL` records `cancelReason`,
  // `openController` is born aborted from it, and the one-term `runStep` fence
  // refuses. Measured with the seam neutered on the guard arc, external abort
  // from `onTransitionStart`: 1 controller, guards `[]` — against 0 and `[]`
  // with the seam. Nothing is closed here
  // either way: the second group opened a cancellability scope, and the `CANCEL`
  // that moved the machine closed it on the way out. Counted, never traced, by
  // `born-dead-navigation-1648.test.ts` — both of its `describe`s.
  if (!deps.startTransition(plan)) {
    throw freezeThrownError(new RouterError(errorCodes.TRANSITION_CANCELLED));
  }

  // The one place this brand is minted, and it is below the send.
  return plan as AnnouncedPlan;
}

/**
 * The uninterruptible navigation, end to end (RFC §5.1, cut A).
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
 * It takes an `AnnouncedPlan` because it must run AFTER the announce — a
 * `TRANSITION_START` listener may still register a guard, and the maps read
 * below have to reflect that. Passing a plan that has not been announced does
 * not compile; the brand is minted in one place, below the send.
 */
function planPhases(deps: NavigationDependencies, plan: AnnouncedPlan): void {
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
  // The guards of THIS transition, not of the router: asking the Maps for their
  // size armed the cancellation machinery for every public navigation whenever
  // the app had one `canActivate` anywhere — measured at +643 B and +97.7 ns
  // per navigation that never touches the guarded route, with the method and
  // the after-figures in `core/CLAUDE.md`. Both terms mirror the
  // interpreter — a phase whose short-circuit is false runs no step — which is
  // what keeps this a gate rather than a second policy. `guards-off-path`
  // counts controllers on both halves.
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
  // the marker a supersession token carries as `myId === 0` (#1648/#1664).
  let nav: NavigationPlan | undefined;

  try {
    fromState = deps.getState();

    // Read FIRST and once: everything that happens to the signal after this
    // point happened INSIDE the navigation, and must reach it through the
    // machine rather than through a throw.
    const externalSignal = opts.signal;
    const abortedAtEntry =
      externalSignal?.aborted === true ? externalSignal : undefined;

    // ⚑ THE ENTRY DOOR (#1962). One walk of the caller's bag, into a frozen
    // record core owns — and everything below reads that, never the caller's
    // object again.
    //
    // What it closes is not the aliasing but the INCONSISTENCY: without it a
    // plugin receives the application's own literal on three arcs and a copy on
    // two, discriminated by whether the caller passed a `signal` — which the
    // plugin never sees. Annotating the hook argument, the cheapest way to pass
    // a flag from one hook to the next, then writes into the application's
    // object or into a private copy depending on an unrelated detail of the
    // call.
    //
    // ⚑ It sits BELOW the signal read and ABOVE every other one, and that order
    // is what keeps #1817's guarantee intact rather than merely unbroken: the
    // walk skips `signal` (already read, once), and the six flags hoisted below
    // now come off core's own data, so the caller's accessors are entered
    // exactly once per key — including keys core never names.
    opts = adoptNavigationOptions(opts);

    // ⚑ EVERY flag is hoisted here, above both readers (#1719 / #1817), on the
    // stated ground that `opts` is accessor- or Proxy-backed BY CONTRACT, so
    // each read is a call into application code. The entry is the only site that
    // reads any of them, and `entry-reads-opts-once.test.ts` derives that set.
    //
    // ⚠ What this is and is not. It finishes a rule the codebase already states
    // about itself, and adds no check. It is NOT a safety fix: making two reads
    // disagree needs a getter that answers differently between them, and the
    // accessor-backed bags that occur in practice (Vue `reactive()`, Svelte
    // `$props()`) are pass-through and stable. The drift is the INSTRUMENT the
    // guard cells use to make the read count observable, exactly as a stable
    // `toString` measures nothing in the route-name family.
    //
    // ⚠ `force` is read unconditionally rather than lazily, so its per-arc count
    // is not uniformly lower than a lazy read's. One read per field at the entry
    // is the rule this file is held to, and reproducing the pre-check's own
    // short-circuit here would put the hoist back in the business of knowing what
    // that pre-check does internally — the coupling #1719 undoes.
    const reload = opts.reload;
    const force = opts.force;
    const replaceRequested = opts.replace;
    const redirected = opts.redirected;
    const forceDeactivate = opts.forceDeactivate === true;

    const forcedReplace =
      fromState?.name === constants.UNKNOWN_ROUTE && !replaceRequested;
    const replace = forcedReplace || replaceRequested;

    opts = substituteForcedReplace(opts, forcedReplace);

    if (isSameNavigation(fromState, reload, force, toState)) {
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

    // The scope is open — the machine adopted this plan — and the first thing it
    // does is ADOPT what the caller's signal already says (#1704).
    //
    // `addEventListener` never fires retroactively, so a bridge is only as good
    // as the instant it was registered, and a window stands in front of the
    // earliest one: AFTER the entry snapshot, `forceReplaceFromUnknown`'s spread
    // and `isSameNavigation` read the caller's object again — reads that ARE
    // application code when `opts` is accessor- or Proxy-backed. An abort raised
    // there is what `entry-abort-boundary` pins as announced-then-cancelled;
    // without this line it left the bridge on a dead signal and the machine
    // untold.
    //
    // ⚠ Here and not beside the registration it protects: `CANCEL` is declared
    // in the band only, so asking earlier is a table no-op — moving this above
    // `startTransition` reds the same set of tests as deleting it does.
    //
    // ⚠ **Not a helper.** As a function these four lines measured
    // `navigate/sync-baseline` 8.2720 → 9.5540 ms on the runner, and 8.2728
    // inlined again — the same pair #1728 later explained as a step of
    // CodSpeed's valgrind MODEL rather than of the clock, where the same arc has
    // master faster natively. Keep the inline shape, but weigh any step this arc
    // reports against a wall-clock run first.
    const abortedSignal = plan.externalSignal;

    if (abortedSignal?.aborted === true) {
      deps.cancelNavigation(abortedSignal.reason);
    }

    // Post-`startTransition` supersession is caught by `when: mayCommit` on the
    // COMPLETE edge, asked inside `completeTransition`: a `stop()`/`dispose()`
    // from the TRANSITION_START listener leaves the FSM in IDLE/DISPOSED, where
    // COMPLETE is not declared at all, and an aborted external `opts.signal` is
    // read straight off the commit payload. (Async supersession is additionally
    // caught in `finishAsyncNavigation` / the guard pipeline's `isLive`;
    // a reentrant navigate() is banned — REENTRANT_NAVIGATION.)

    planPhases(deps, plan);

    bridgeLateIfOnlyGuardsCanAbort(deps, plan);

    // Cut A (RFC §5.1). `immediate` is the RFC's four-term predicate
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

    // NOT equivalent, and a `Stryker disable: equivalent` here would be
    // wrong: with `if (true)` the guard branch runs AFTER
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
      // have landed — `bridgeLateIfOnlyGuardsCanAbort`, earlier in this
      // function, sends one itself when the caller's signal was aborted in the announce
      // window — and it had no controller to abort. Born unaborted, this one
      // would satisfy `isLive` below and the walk would ask the guards of
      // a navigation whose `TRANSITION_CANCEL` has already been emitted.
      const controller = openController(plan);
      // The liveness the guard walk is fenced on, and the same predicate
      // `finishAsyncNavigation` asks (#1687). ONE term, because `aborted` is what
      // decides on every source: a supersede, a `stop()`/`dispose()` and the
      // caller's own `opts.signal` all reach the controller through FSM
      // `CANCEL`. `CANCEL` carries no `update`, so `ctx.inflight` still names
      // this navigation on the way out (#1671) and the machine lands in `READY`
      // — which is why identity cannot answer here and `aborted` must.
      //
      // ⚑ Scope, deliberately: this stops GUARDS. The `subscribeLeave` dispatch
      // is NOT fenced and must not be — a leave listener is documented to fire
      // when the FSM enters `LEAVE_APPROVED` (INVARIANTS `subscribeLeave`, the
      // section's own statement) and to receive a signal that aborts on
      // cancellation (row 8), i.e. being called
      // with `aborted === true` is its contract, not a leak.
      const isLive = () => !controller.signal.aborted;

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
        isLive,
        emitLeaveApproveCallback,
      );

      if (guardCompletion !== undefined) {
        // The plan IS the `NavigationContext` (a superset of it), so the
        // second literal a separate context would need is unnecessary — one
        // bag per navigation.
        return finishAsyncNavigation(deps, guardCompletion, plan, controller);
      }

      if (!isLive()) {
        throw freezeThrownError(
          new RouterError(errorCodes.TRANSITION_CANCELLED),
        );
      }

      // ⚑ Nothing to release: the controller dies with the plan, and the plan
      // stays in `ctx.inflight` until the machine clears it — on `COMPLETE`, or
      // with both state cells at `dispose()`.
    }

    // The commit gate is `when: mayCommit` on the COMPLETE edge, and closing the
    // cancellability scope is that same edge's action — both happen one frame
    // deeper, inside the call below.
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
  // The same predicate as the guard walk's fence — see the comment above the
  // other `isLive`, in `executeNavigation`'s guard branch.
  const isLive = () => !controller.signal.aborted;

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
  // post-race `isLive()` check below throws TRANSITION_CANCELLED — the same
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

  // Consume `guardCompletion`: on most arcs `Promise.race` below already
  // subscribes to it, but when the pre-check throws the race is never built and
  // a late settlement has no handler at all — under Node 22+ that kills the
  // process. Reached by a guard that aborts the signal itself before returning;
  // pinned by `late-guard-rejection-is-consumed`.
  guardCompletion.catch(() => {
    /* settlement consumed — the race already decided the navigation */
  });

  try {
    // Reaching here with an aborted signal means the bridge — live since the
    // `NAVIGATE` action — already fired and the machine has already cancelled.
    // Refusing right away carries the caller's own `reason` into the rejection
    // instead of waiting for the post-race check to synthesize one.
    if (externalSignal?.aborted) {
      throw freezeThrownError(
        new RouterError(errorCodes.TRANSITION_CANCELLED, {
          reason: externalSignal.reason,
        }),
      );
    }

    // The race settles two ways and BOTH have to consult liveness. Only this
    // arm did: a rejection throws straight past the check into the `catch`,
    // which is where #1609 lived.
    await Promise.race([guardCompletion, abortRace]);

    if (!isLive()) {
      throw freezeThrownError(new RouterError(errorCodes.TRANSITION_CANCELLED));
    }

    const state = completeTransition(deps, nav);

    succeeded = true;

    return state;
  } catch (error) {
    // Liveness on the OTHER arm of the race (#1609). A guard that rejects one
    // or two microtasks before a superseding `navigate()` would otherwise
    // report FAIL for a navigation cancelled several microtasks earlier —
    // `routeTransitionError` filters by error CODE, and `CANNOT_ACTIVATE` is
    // not `TRANSITION_CANCELLED`. Into a `READY` FSM that is observability
    // noise (a terminal event for a dead navigation); into the LIVE one it is
    // silent corruption, because `TRANSITION_STARTED --FAIL--> READY` is a real
    // edge, so the superseding navigation's later `COMPLETE` became a table
    // no-op: state committed, `TRANSITION_SUCCESS` never emitted, subscribers
    // never notified.
    const outcome = isLive() ? error : asCancellation(error);

    failureReason = outcome;

    routeTransitionError(deps, outcome, nav.fromState, nav);

    throw outcome;
    // NB: emptying the `finally` is NOT equivalent (#1684). This IS the abort
    // for every failure the machine never hears about — a rejecting guard, a
    // leave listener that threw — so removing it leaves a captured leave signal
    // unaborted on a navigation that failed.
  } finally {
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
 * report it while the machine is still in the transition, and hand back the
 * outcome the caller's promise should carry.
 *
 * `nav === undefined` means `TRANSITION_START` never fired, so there is no
 * announced navigation for a terminal event to pair with — the error goes back
 * untouched, and the report can NAME the navigation without an assertion
 * (#1648).
 *
 * **Has the FSM left my transition?** is the precondition for sending `FAIL`,
 * and `isActive()` is the looser approximation that gets a case wrong: a
 * listener running `stop()` and then a `start()` PARKED in an async interceptor
 * leaves the FSM in `STARTING`, where `isActive()` is true again — for a
 * different lifecycle, whose start the stale `FAIL` would kill
 * (`STARTING --FAIL--> IDLE`). Measured: swapping the predicate for
 * `isActive()` reds 115 tests. The predicate stands alone — an identity term
 * beside it decides nothing, in any configuration (#1734).
 *
 * The restatement below is `asCancellation` — see `./errorHandling` for what it
 * measures.
 */
function handleNavigateError(
  deps: NavigationDependencies,
  error: unknown,
  attempted: AttemptedNavigation,
): unknown {
  const { nav } = attempted;

  // The failing navigation's OWN controller, read off the plan so both arcs are
  // covered (#1684); `undefined` is the born-dead case — nothing was announced,
  // so there is nothing to abort. Pinned by `leave-signal-cancellation` (#722).
  nav?.controller?.abort(error);

  if (nav !== undefined) {
    const outcome = deps.isTransitioning() ? error : asCancellation(error);

    routeTransitionError(deps, outcome, attempted.fromState, nav);

    return outcome;
  }

  return error;
}

/**
 * The leave phase for a navigation with no guards, but with something that can
 * suspend it: a `subscribeLeave` listener, a pre-commit plugin listener, or the
 * caller's own `signal`.
 */
function handleNoGuardsLeave(
  deps: NavigationDependencies,
  plan: NavigationPlan,
): Promise<State> | undefined {
  const { toState, fromState } = plan;

  // Opened BEFORE the announce (#1697), so the signal handed to the listeners
  // below does not depend on the replay in `openController` having worked.
  //
  // ⚠ No BEHAVIOUR test holds this line — a cancel from inside the announce
  // reaches a controller opened afterwards too, since #1706 makes it born
  // aborted, so deleting the open reds no behaviour test at all. **The coverage
  // gate holds it**: this is the only site that opens twice, so without it
  // `openController`'s idempotence arm (the `existing !== undefined` early
  // return) is unreachable and the 100 % thresholds fail. Measure BRANCHES,
  // not just red tests,
  // before calling it redundant. The GATE around it is load-bearing separately:
  // cut A allocates nothing, and this is where that is decided
  // (`controller-allocation`, `guards-off-path`).
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
    throw freezeThrownError(
      new RouterError(errorCodes.TRANSITION_CANCELLED, {
        reason: abortedAtEntry.reason,
      }),
    );
  }
}
