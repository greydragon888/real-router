// packages/core/src/routerFSM.ts

import { freezeStateShell } from "./helpers";
import { FSM } from "./utils/fsm";

import type { NavigationOptions, State } from "./types";
import type { TransitionTable } from "./utils/fsm";

/**
 * Router FSM states.
 *
 * - IDLE: Router not started or stopped
 * - STARTING: Router is initializing
 * - READY: Router is ready for navigation
 * - TRANSITION_STARTED: Navigation in progress (before deactivation guards)
 * - LEAVE_APPROVED: Deactivation guards passed, activation guards pending
 * - DISPOSED: Router has been disposed (R2+)
 */
export const routerStates = {
  IDLE: "IDLE",
  STARTING: "STARTING",
  READY: "READY",
  TRANSITION_STARTED: "TRANSITION_STARTED",
  LEAVE_APPROVED: "LEAVE_APPROVED",
  DISPOSED: "DISPOSED",
} as const;

export type RouterState = (typeof routerStates)[keyof typeof routerStates];

/**
 * Router FSM events.
 *
 * - START: Begin router initialization
 * - STARTED: Router initialization complete
 * - NAVIGATE: Begin navigation
 * - COMPLETE: Navigation completed successfully
 * - FAIL: Navigation or initialization failed
 * - CANCEL: Navigation cancelled
 * - STOP: Stop router
 * - DISPOSE: Dispose router (R2+)
 */
export const routerEvents = {
  START: "START",
  STARTED: "STARTED",
  NAVIGATE: "NAVIGATE",
  LEAVE_APPROVE: "LEAVE_APPROVE",
  COMPLETE: "COMPLETE",
  FAIL: "FAIL",
  CANCEL: "CANCEL",
  STOP: "STOP",
  DISPOSE: "DISPOSE",
  /**
   * A commit that is NOT a navigation: the 404 bypass and `replace()`'s
   * revalidation. Both used to write the state and announce it themselves,
   * outside the machine — the two remaining ruptures of "every channel that
   * changes committed state goes through the table" (plan §6.1, §6.2).
   */
  SYSTEM_COMMIT: "SYSTEM_COMMIT",
} as const;

export type RouterEvent = (typeof routerEvents)[keyof typeof routerEvents];

/**
 * Per-event payloads for the router FSM (#1169 commit-gate). The three hot
 * navigation transitions carry their transition states so the FSM action
 * dispatched by `send()` emits the matching transition event — i.e. events are
 * literal consequences of FSM transitions (no `forceState` + manual emit). See
 * `EventBusNamespace.#setupFSMActions`.
 *
 * ⚑ **None of them carries an identity FIELD, and that is the design (#1648).**
 * A navigation used to hand the table a number it had read back from the
 * machine (`nav.myEpoch`), so the table could only check what the caller chose
 * to stamp — the honesty of the stamp was a convention. The identity is now the
 * payload OBJECT itself: `NavigationPlan` is what `navigate()` builds, it IS the
 * payload for NAVIGATE / LEAVE_APPROVE / COMPLETE, and `beginNavigation`
 * remembers it in {@link RouterFSMContext.inflight}. So "is this send stale?" is
 * `payload === ctx.inflight` — a question no caller can answer dishonestly,
 * because presenting the live navigation means presenting the live object.
 * There is no epoch to read, to pass, or to get wrong.
 */
export interface RouterPayloads {
  NAVIGATE: {
    toState: State;
    fromState?: State | undefined;
    /**
     * The navigation's own `AbortController`, when it has one (#1684). Read by
     * ONE reader, the `CANCEL` action — never by the table: the `NAVIGATE`
     * `update` only remembers the payload, and `mayCommit` asks about the
     * caller's EXTERNAL signal (`opts.signal`), not this one. So the field
     * lives on the layer where effects already live (bookkeeping in `update`,
     * effects in the action — RFC-10a §6.2), and it is the same slot the
     * pipeline reads through {@link NavigationContext.controller}.
     */
    controller?: AbortController | undefined;
  };
  LEAVE_APPROVE: { toState: State; fromState?: State | undefined };
  COMPLETE: {
    toState: State;
    fromState?: State | undefined;
    opts?: NavigationOptions | undefined;
  };
  /**
   * RFC-10a §7.2 — FAIL and CANCEL carry their own data now. This is what kills
   * the `#pending*` side channel (satellite S2): the action reads a parameter
   * instead of instance fields written "just before send()", so the #949
   * "valid only in this window" contract has no field left to attach to.
   */
  FAIL: {
    /**
     * The navigation this failure belongs to — the plan object itself, compared
     * by reference against {@link RouterFSMContext.inflight}. `undefined` is
     * legal and means "not a navigation failure at all": both no-navigation
     * senders (`Router.#unwindFailedStart` and the plugin-facing report in
     * `RouterLifecycleNamespace`) take `STARTING --FAIL--> IDLE`, which carries
     * no `when`. The early validation errors that used to be a third such
     * sender do not send FAIL at all any more: S7 re-routed them to a direct
     * `TRANSITION_ERROR` emit and removed the `READY→FAIL` edge they took
     * (RFC-10a §16.5).
     *
     * Typed `object` rather than `NavigationPlan` deliberately: the table needs
     * IDENTITY, not structure, and the machine must not learn the pipeline's
     * types to compare two references.
     */
    nav?: object | undefined;
    fromState?: State | undefined;
    error?: unknown;
  };
  /**
   * No `toState`: since #1671 the ACTION reads it off the context instead. The
   * two CANCEL edges are declared inside the transition band only, and
   * `inflight` is no longer cleared on the way out, so the value the action
   * needs is still there when it runs.
   */
  CANCEL: { fromState?: State | undefined; reason?: unknown };
  SYSTEM_COMMIT: {
    toState: State;
    fromState?: State | undefined;
    opts: NavigationOptions;
  };
}

/**
 * The machine's own memory (RFC-10a §7.1). Three fields, all mutated ONLY by
 * table updates — never from outside.
 *
 * There is deliberately no `inflightFromState`: every cancel source already
 * carries `fromState` (it reads the committed state), and after the ownership
 * move it would duplicate the context's own `current` — RFC-10a §16.6.
 */
export interface RouterFSMContext {
  /**
   * **The navigation the machine is currently carrying — the object, not a
   * number (#1648).** This one field is the navigation's IDENTITY and its
   * TARGET at once: it holds the `NAVIGATE` payload, which is the
   * `NavigationPlan` itself, so `payload === ctx.inflight` answers "is this send
   * still the live navigation's?" and `ctx.inflight.toState` answers "where was
   * it going?".
   *
   * It replaced a counter (`epoch`, itself the promoted
   * `InFlightNavigation.#id`) plus a separate `inflightToState`. The counter
   * existed so a sender could stamp its sends and the table could compare
   * stamps; identity by reference needs neither the stamp nor the counter, and
   * a caller cannot present a live identity it does not hold.
   *
   * ⚠ INTERNAL, and never to be exposed as a public snapshot version — that is
   * exactly what the counter was refused for (plan §11.C2). A reference is
   * additionally unserialisable, which keeps that door shut structurally.
   *
   * ⚑ **Meaningful INSIDE the transition band only, and deliberately allowed to
   * be stale outside it (#1671).** Written by `beginNavigation` on the three
   * edges that enter the band; cleared by `commitNavigation` (COMPLETE) and
   * `resetState` (DISPOSE) — but NOT on the way out through CANCEL or FAIL,
   * because those edges' ACTIONS are the readers and an `update` runs first.
   * So after a cancelled or failed navigation the last plan lingers here until
   * the next `beginNavigation` overwrites it: ONE slot, never a growing set.
   * That slot now holds a plan rather than a `State`, i.e. it also keeps the
   * caller's `opts` (with any external `AbortSignal`) and the guard maps
   * reachable until the next navigation — bounded and accepted; the guard maps
   * are owned by `RouteLifecycleNamespace` regardless.
   *
   * The readers, and the gate each is under — check this list before adding one:
   * - the CANCEL action, declared on `TRANSITION_STARTED` / `LEAVE_APPROVED`
   *   only, so it runs in-band by construction;
   * - the two IN-BAND FAIL actions, same argument. The third FAIL edge,
   *   `STARTING --FAIL--> IDLE`, has its OWN action precisely because it is
   *   outside the band: a failed `start()` is not a navigation failure and has
   *   no target to name, so it emits `undefined` rather than reading here;
   * - `mayCommit` / `mayFail`, which compare against it by reference.
   *
   * ⚠ Declaring `CANCEL` or `FAIL` from a state outside the band would make
   * the staleness reachable. That is the one edit this field cannot survive
   * silently.
   */
  inflight: RouterPayloads["NAVIGATE"] | undefined;
  /**
   * The committed state, and the one it displaced. Formerly
   * `StateNamespace.#frozenState` / `#previousState`.
   *
   * The pair moves TOGETHER and never separately: `set()` shifts one into the
   * other, so splitting them between the machine and a store would smear that
   * shift across two owners — the exact defect the move exists to remove
   * (plan §11.A2).
   */
  current: State | undefined;
  previous: State | undefined;
}

export function createInitialRouterFSMContext(): RouterFSMContext {
  return {
    inflight: undefined,
    current: undefined,
    previous: undefined,
  };
}

/**
 * A FAIL naming no navigation is legal (start-unwind); one naming a navigation
 * that is no longer in flight is stale — it belongs to a navigation that has
 * already been superseded, and letting it through would move the machine out
 * from under the live one, turning its COMPLETE into a table no-op (#1609).
 *
 * ⚑ **The question is IDENTITY, asked by reference (#1648):** the payload names
 * its navigation by handing back the plan object, and `ctx.inflight` is the plan
 * the machine is carrying. Before that this compared two numbers, and the number
 * was one the sender had read out of the machine and stamped by hand — so the
 * table could only check what it was given honestly.
 *
 * ⚠ **This predicate cannot currently refuse, and that is measured, not
 * assumed (#1646).** Instrumented over the whole functional tier it is asked
 * 206 times and returns `false` zero times — never once for a dead navigation.
 * The reason is structural rather than lucky: `ctx.inflight` is written ONLY by
 * the NAVIGATE update, so the navigation a sender can name is by construction
 * the one the machine adopted; and both live FAIL senders are already gated on
 * that same identity through `deps.isCurrentNavigation`, with
 * `asCancellation` restating a lost-liveness failure as `TRANSITION_CANCELLED`
 * — which `routeTransitionError` filters out before any send. Three adversarial
 * arcs (guard-redirect, a guard rejecting after a supersede landed, the
 * ROUTE_NOT_FOUND arc) were driven deliberately: all three end in `CANCELLED`
 * with no `TRANSITION_ERROR` at all. The `nav === undefined` half is dead for
 * a second reason — the two navigation-less senders
 * (`Router.#unwindFailedStart` and the plugin-facing report in
 * `RouterLifecycleNamespace`) both take `STARTING --FAIL--> IDLE`, which
 * carries no `when`.
 *
 * ⚑ **What it DOES hold is measured too (#1672), and that is new.** Two-sided
 * mutation: removing `asCancellation` alone fails 5 tests, removing it AND this
 * predicate fails **6**. The sixth is `superseded-guard-rejection-1609.test.ts`
 * "outcome 2: the superseding navigation still emits TRANSITION_SUCCESS and
 * notifies subscribers" — exactly the silent-commit shape. So the division of
 * labour is known rather than assumed: `asCancellation` holds the half facing
 * the CALLER (which code `navigate()` rejects with), this predicate holds the
 * half facing SUBSCRIBERS. "Defence-in-depth" below names a second half, it is
 * not a hedge.
 *
 * The dead disjunct is dead by count as well as by argument: measured on the
 * epoch form this replaced, all 206 asks carried a LIVE identity — `p=2 ctx=2`
 * ×130, `p=3 ctx=3` ×60, `p=1 ctx=1` ×12, `p=4 ctx=4` ×4 — so the
 * no-navigation branch is never TAKEN, not merely never decisive. Re-measured
 * after the switch to reference identity: `mayFail → true` still kills nothing
 * (#1648 §5.6), i.e. the change is behaviour-equivalent.
 *
 * So it is a PROVEN EQUIVALENT in the mutation-testing sense, kept as
 * defence-in-depth for the day the liveness gates above it change: the table is
 * the last thing between a stale terminal report and the live navigation, and
 * two comparisons is what that costs. Do NOT read its survival as a coverage
 * gap to be closed with a test — no test can reach it without changing
 * production code first (core CLAUDE.md, "Mutation testing": prove equivalence,
 * then document rather than chase).
 *
 * ⚠ **The first disjunct ADMITS rather than refuses, and it rests on an
 * INVENTORY, not on an argument: every navigation-less FAIL must reach the
 * table only from `STARTING`.** Two senders satisfy it — `#unwindFailedStart`
 * and the plugin-facing report — and both are gated on `isStarting()` /
 * declared on that edge alone. A third one is the edit this predicate cannot
 * survive: admitted from inside the band, its FAIL takes
 * `TRANSITION_STARTED/LEAVE_APPROVED --FAIL--> READY`, whose action names the
 * LIVE navigation as the failure and moves the machine out from under it —
 * committed, silently, with no `TRANSITION_SUCCESS` for anyone. That is not
 * hypothetical: `RouterLifecycleNamespace.start` reported its `ROUTE_NOT_FOUND`
 * here until it turned out to be a duplicate of the unwind, and was removed.
 * Tightening this disjunct is NOT the fix if it happens again — a
 * `nav !== undefined &&` form can only be covered while such a sender exists,
 * so the guard would live off the very defect it guards against. Check the
 * inventory when adding a `sendFail`; report early refusals through
 * `emitTransitionError` (channel (б) in `wireNamespaces`), which does not move
 * the machine.
 */
const mayFail = (
  ctx: RouterFSMContext,
  payload: RouterPayloads["FAIL"] | undefined,
): boolean => payload?.nav === undefined || payload.nav === ctx.inflight;

/**
 * The commit gate, as a condition on the edge the commit takes. Both halves of
 * the interim check it replaces are here: a superseded navigation is no longer
 * the object in `ctx.inflight` (the nested NAVIGATE replaced it), and a
 * terminated router has no COMPLETE edge at all — COMPLETE is declared from
 * LEAVE_APPROVED only.
 *
 * ⚑ The `payload !== undefined` term is not defensive noise: `canSend(COMPLETE)`
 * may be asked WITHOUT a payload (engine INVARIANT "Totality over absence"), and
 * `undefined === ctx.inflight` would be TRUE the moment nothing is in flight.
 * Spelling it out keeps the ask conservative, which is the direction this gate
 * must fail in.
 */
const mayCommit = (
  ctx: RouterFSMContext,
  payload: RouterPayloads["COMPLETE"] | undefined,
): boolean =>
  payload !== undefined &&
  payload === ctx.inflight &&
  payload.opts?.signal?.aborted !== true;

/**
 * The pair shift, and the ONLY place it happens for a navigation commit. It
 * runs as an `update`, i.e. after the machine has already decided the
 * transition fires — so "committed" and "announced" cannot come apart.
 */
const commitState = (ctx: RouterFSMContext, state: State): void => {
  ctx.previous = ctx.current;
  ctx.current = freezeStateShell(state);
};

const commitNavigation = (
  ctx: RouterFSMContext,
  payload: RouterPayloads["COMPLETE"],
): void => {
  commitState(ctx, payload.toState);
  ctx.inflight = undefined;
};

const commitSystemState = (
  ctx: RouterFSMContext,
  payload: RouterPayloads["SYSTEM_COMMIT"],
): void => {
  commitState(ctx, payload.toState);
};

/**
 * `stop()` — SHIFTS the pair, so `getPreviousState()` still answers with the
 * state the router was stopped from. Deliberately not the same primitive as
 * DISPOSE below (plan §11.A2 measured the difference: `stop()` leaves
 * `undefined / b`, `dispose()` leaves `undefined / undefined`).
 */
const clearCurrent = (ctx: RouterFSMContext): void => {
  ctx.previous = ctx.current;
  ctx.current = undefined;
};

/** `dispose()` — zeroes BOTH cells at once, no shift. */
const resetState = (ctx: RouterFSMContext): void => {
  ctx.current = undefined;
  ctx.previous = undefined;
  ctx.inflight = undefined;
};

/**
 * Entering the transition band: the machine adopts the navigation as the one it
 * is carrying. This IS the moment identity is issued (#1648) — there is nothing
 * to stamp, because the identity is the object being adopted.
 */
const beginNavigation = (
  ctx: RouterFSMContext,
  payload: RouterPayloads["NAVIGATE"],
): void => {
  ctx.inflight = payload;
};

/**
 * Router FSM configuration.
 *
 * Transitions:
 * - IDLE → STARTING (START), DISPOSED (DISPOSE)
 * - STARTING → READY (STARTED), IDLE (FAIL, STOP), DISPOSED (DISPOSE)
 * - READY → TRANSITION_STARTED (NAVIGATE), READY (SYSTEM_COMMIT, self-loop for the two commits that are not transitions), IDLE (STOP), DISPOSED (DISPOSE)
 * - TRANSITION_STARTED → LEAVE_APPROVED (LEAVE_APPROVE), TRANSITION_STARTED (NAVIGATE, self-loop), READY (CANCEL, FAIL), DISPOSED (DISPOSE)
 * - LEAVE_APPROVED → READY (COMPLETE, CANCEL, FAIL), TRANSITION_STARTED (NAVIGATE), DISPOSED (DISPOSE)
 * - DISPOSED → (no transitions)
 *
 * DISPOSE is wired from every non-DISPOSED state so `router.dispose()` always
 * settles the FSM at DISPOSED. The facade orchestrates cleanup through IDLE
 * for healthy flows; the direct transitions guarantee the FSM is not left
 * stuck if cleanup is skipped (e.g. dispose mid-STARTING when the start
 * pipeline threw before STARTED/FAIL).
 *
 * ⛔ **THIS GRAPH MAY NOT BE CLEANED BY TRACE COVERAGE.** Read this before
 * deleting an edge that "nothing ever takes". It was established by
 * measurement, not caution: an `onTransition` recorder over all 4469 tests of
 * the three tiers traversed **15 of 20** edges, and every one of the other five
 * was then mutated away individually. Not one was dead. An edge belongs to
 * exactly one of three categories, and only the first is removable:
 *
 * 1. **No sender** — nothing left in core can send the event from this state.
 *    Removable, and the inventory of senders is the proof. The `READY→FAIL`
 *    edge was the one instance: it had two, both re-routed off the machine as
 *    reports, and the edge went with them (§16.5). Note that it was TRAVERSED
 *    while it lived — traversal did not make it necessary, and non-traversal
 *    does not make the others removable. The two facts are independent.
 * 2. **Permission bit** — never traversed, load-bearing anyway, because it is
 *    read through `canSend()` rather than taken. The two `NAVIGATE` self-loops
 *    are these: `abortPreviousNavigation` walks the machine back to READY
 *    before `sendNavigate`, so the loop never fires, but its DECLARATION is
 *    what makes `canSend(NAVIGATE)` true mid-navigation, i.e. what makes
 *    supersede legal. Removing them fails 10 and 30 tests respectively (9 and
 *    29 of those are supersede BEHAVIOUR; the remaining one each is the
 *    closure assertion in `fsm-edge-reachability.test.ts`, which notices the
 *    edge is gone) — with supersede dying SILENTLY at the predicate, not at
 *    the send. `canSend` is read FIVE times in core: NAVIGATE / START / CANCEL
 *    as bare permission bits, plus COMPLETE (with payload) and SYSTEM_COMMIT,
 *    which the ask-protocol added in #1641 / #1644 and which are each followed
 *    by a send. An edge for one of the first three is a candidate for this
 *    category by construction. ⚠ This said "exactly three times" until #1672 —
 *    written before the ask-protocol, and #1648's analysis inherited the number
 *    from here rather than from the code.
 * 3. **Fail-safe** — dead on every healthy flow and there precisely for the
 *    unhealthy one. The three direct `DISPOSE` edges (#660) are these: 3881
 *    tests pass without them because no test reaches the state they exist for.
 *
 * The corollary for the two `NAVIGATE` self-loops specifically: their `update`
 * is dead code (the machine adopts the navigation on the READY edge, the only
 * one that fires), and it is kept anyway so the three declarations stay identical —
 * a self-loop that silently differed from its sibling is a worse failure than
 * an unreachable line, and coverage does not see either.
 */
const routerTransitions: TransitionTable<
  RouterState,
  RouterEvent,
  RouterFSMContext,
  RouterPayloads
> = {
  [routerStates.IDLE]: {
    [routerEvents.START]: routerStates.STARTING,
    [routerEvents.DISPOSE]: {
      target: routerStates.DISPOSED,
      update: resetState,
    },
  },
  [routerStates.STARTING]: {
    // ⚑ There is no SYSTEM_COMMIT edge here, and its absence is a MEASURED
    // answer rather than an omission. One was added on the strength of the
    // phase-4.1 spikes ("`start()` with `allowNotFound` commits its 404 while
    // still STARTING; so does a `replace()` inside an async start
    // interceptor") and both claims are false against this code:
    // `RouterLifecycleNamespace.start` calls `completeStart()` — which sends
    // STARTED and leaves STARTING — BEFORE `navigateToNotFound`, an order
    // standing since #123 (2026-02-20); and the `replace()` revalidation
    // commits only when a state IS committed, which means start finished.
    // Both arcs traced through `READY --SYSTEM_COMMIT--> READY`, no test of
    // 4506 traversed the STARTING edge, and removing it failed none.
    //
    // Consequence worth knowing: a system commit attempted from STARTING is
    // now LOUD. `systemCommit()` asks `canSend` first and THROWS, so an arc
    // nobody has named surfaces instead of silently not committing.
    //
    // ⚠ The code is `ROUTER_NOT_STARTED`, not `ROUTER_DISPOSED` — this comment
    // said the latter until #1647 and it was written one issue too early.
    // #1186's gate was `!isActive()`, where DISPOSED was nearly always the
    // truth; #1644 replaced it with `canSend(SYSTEM_COMMIT)`, which also
    // refuses a LIVE router that is merely starting or mid-transition, and
    // split the codes accordingly (`EventBusNamespace.#refuseSystemCommit`).
    // Measured on all four arms: disposed → `ROUTER_DISPOSED`; stopped,
    // never-started and STARTING → `ROUTER_NOT_STARTED`, the last one with a
    // message naming the boot window (#1647). Reading the stale form is what
    // made the #1647 research keep a facade predicate it did not need.
    [routerEvents.STARTED]: routerStates.READY,
    [routerEvents.FAIL]: routerStates.IDLE,
    [routerEvents.STOP]: { target: routerStates.IDLE, update: clearCurrent },
    [routerEvents.DISPOSE]: {
      target: routerStates.DISPOSED,
      update: resetState,
    },
  },
  [routerStates.READY]: {
    // The one NAVIGATE edge that is ever TRAVERSED, and therefore the one that
    // adopts the navigation: `abortPreviousNavigation` drives the machine back
    // to READY before `sendNavigate` runs, so a supersede arrives here too.
    //
    // ⚠ **`sendNavigate` reads this edge's OUTCOME, and that is load-bearing
    // (#1648).** `send()` returns the resulting state, so
    // `send(NAVIGATE, plan) === TRANSITION_STARTED` is exactly "the edge fired",
    // and `beginTransition` refuses a navigation for which it did NOT — user
    // code (a `stop()` from a `forwardState` interceptor) can drive the machine
    // out of the band between `canNavigate()` and the send, and such a
    // navigation is born dead: never announced, with nothing to carry it.
    // The test is exact only because all three NAVIGATE edges target
    // TRANSITION_STARTED and none carries a `when`. **Adding a `when` to any of
    // them turns the check silently FALSE-GREEN** — a refusal would return the
    // same TRANSITION_STARTED the send started from. Move the check to a
    // context read if that day comes.
    [routerEvents.NAVIGATE]: {
      target: routerStates.TRANSITION_STARTED,
      update: beginNavigation,
    },
    // ⚑ There is no FAIL edge from READY, and its absence is the ANSWER to
    // RFC-10a §16.5 rather than an omission. The edge existed for exactly two
    // senders — early validation errors and the plugin-facing report — and both
    // are channel (б): reports to observers, not failures of a transition. Once
    // they emit directly, nothing legal is left to send FAIL from here, and a
    // STALE one (a superseded navigation reporting late) becomes a table no-op
    // structurally, which is stronger than the `mayFail` predicate the sketch
    // proposed for it.
    [routerEvents.SYSTEM_COMMIT]: {
      target: routerStates.READY,
      update: commitSystemState,
    },
    [routerEvents.STOP]: { target: routerStates.IDLE, update: clearCurrent },
    [routerEvents.DISPOSE]: {
      target: routerStates.DISPOSED,
      update: resetState,
    },
  },
  [routerStates.TRANSITION_STARTED]: {
    // ⚠ A PERMISSION BIT read through `canSend`, not a transition. Its presence
    // is what makes `canNavigate()` true while a navigation is in flight, i.e.
    // what makes supersede legal at all; it is never traversed, because the
    // cancel always runs first, so this `update` never fires. Removing the edge
    // kills supersede silently at `canNavigate()` — 9 behaviour tests (10 with
    // the edge-reachability closure assertion).
    [routerEvents.NAVIGATE]: {
      target: routerStates.TRANSITION_STARTED,
      update: beginNavigation,
    },
    // ⚑ No epoch condition here, and its absence is MEASURED rather than an
    // omission (#1670). `when: isOwnEpoch` stood on this edge and refused ZERO
    // times in 3464 asks. It is not inert — with the liveness fence at the head
    // of `runStep` removed it refuses four times — but that is a different
    // codebase, not a runtime scenario, and the fence is pinned by four tests
    // WITH the predicate and without it alike. The unreachability is structural:
    // the asynchronous LEAVE_APPROVE arc is exactly one (through `runStep`,
    // fenced on its first line), and the other two send synchronously right
    // after `beginTransition`, where a reentrant navigate is banned. What the
    // predicate would have held is recorded beside that fence, where the
    // invariant actually lives — not here, where it could never fire.
    [routerEvents.LEAVE_APPROVE]: routerStates.LEAVE_APPROVED,
    // ⚑ No `update` either: not clearing `inflight` on the way out is what lets
    // the ACTION read the target off the context (#1671, RFC-10a §16.6 option
    // (г)). The validity window is expressed by the machine's STATE, not by the
    // field's lifetime — see `RouterFSMContext`.
    //
    // ⚑ No `when` here, and its absence is a TAUTOLOGY retired rather than a
    // guard dropped (#1669). `when: hasInflight` asked "is anything in flight?"
    // on the two edges where CANCEL is declared — and `inflight` is
    // written by exactly one `update` (`beginNavigation`, on the only edges that
    // ENTER the band), so inside
    // TRANSITION_STARTED ∪ LEAVE_APPROVED it is always defined and outside it
    // never is. Measured over the whole functional tier: 202 asks, 0 refusals,
    // and — unlike `isOwnEpoch` — removing its hand-rolled twin in
    // `sendCancelIfPossible` does not even change the NUMBER of asks, so there
    // is no configuration in which it could refuse.
    [routerEvents.CANCEL]: routerStates.READY,
    [routerEvents.FAIL]: { target: routerStates.READY, when: mayFail },
    // `dispose()` from inside a transition takes THIS edge — STOP is not
    // declared here — so it is the one that has to zero everything.
    [routerEvents.DISPOSE]: {
      target: routerStates.DISPOSED,
      update: resetState,
    },
  },
  [routerStates.LEAVE_APPROVED]: {
    // Same permission bit as above — 29 behaviour tests depend on it being
    // declared (30 with the edge-reachability closure assertion).
    [routerEvents.NAVIGATE]: {
      target: routerStates.TRANSITION_STARTED,
      update: beginNavigation,
    },
    // The commit IS this edge now: `when` decides, `update` writes, the action
    // announces. There is no separate `setState` left to run ahead of the
    // verdict, which is what makes "committed" and "announced" inseparable —
    // a refused COMPLETE writes nothing at all.
    [routerEvents.COMPLETE]: {
      target: routerStates.READY,
      when: mayCommit,
      update: commitNavigation,
    },
    // Same tautology as the TRANSITION_STARTED edge above (#1669).
    [routerEvents.CANCEL]: routerStates.READY,
    [routerEvents.FAIL]: { target: routerStates.READY, when: mayFail },
    // `dispose()` from inside a transition takes THIS edge — STOP is not
    // declared here — so it is the one that has to zero everything.
    [routerEvents.DISPOSE]: {
      target: routerStates.DISPOSED,
      update: resetState,
    },
  },
  [routerStates.DISPOSED]: {},
};

/**
 * Factory function to create a router FSM instance.
 *
 * @returns FSM instance with initial state "IDLE"
 */
export function createRouterFSM(): FSM<
  RouterState,
  RouterEvent,
  RouterFSMContext,
  RouterPayloads
> {
  return new FSM<RouterState, RouterEvent, RouterFSMContext, RouterPayloads>({
    initial: routerStates.IDLE,
    // Table shared and immutable; CONTEXT per instance, so an SSR clone starts
    // with nothing in flight (RFC-10a §6.5).
    context: createInitialRouterFSMContext(),
    transitions: routerTransitions,
  });
}
