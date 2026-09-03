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
 * Router FSM events. The const below is the inventory; documented here are only
 * the two whose name does not carry them — `LEAVE_APPROVE`, which splits the
 * guard walk (deactivate → approve → activate), and `SYSTEM_COMMIT`, at its own
 * key.
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
   * revalidation. Routing them through the table is what makes "every channel
   * that changes committed state goes through the table" hold without
   * exception (plan §6.1, §6.2).
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
 * Handing the table a number read back from the machine (`nav.myEpoch`) lets
 * it check only what the caller chose to stamp — the honesty of the stamp
 * being a convention. The identity is instead the payload OBJECT itself: `NavigationPlan` is what `navigate()` builds, it IS the
 * payload for NAVIGATE / LEAVE_APPROVE / COMPLETE, and `beginNavigation`
 * remembers it in {@link RouterFSMContext.inflight}. So "is this send stale?" is
 * `payload === ctx.inflight` — a question no caller can answer dishonestly,
 * because presenting the live navigation means presenting the live object.
 * There is no epoch to read, to pass, or to get wrong.
 */
/**
 * **The cancellability scope, as the table sees it (#1716).**
 *
 * One field: how to CLOSE the scope. Opening it is not an operation at all —
 * the scope is born with the plan (`plan-born-in-final-shape` pins the slot in
 * the literal) and the machine ADOPTS it on the `NAVIGATE` edge, which is what
 * `ctx.inflight = payload` already does. Closing is the ACTION of whichever
 * terminal edge the navigation leaves the band through, rather than the
 * pipeline's business spread over four settle sites (#1688) — `CANCEL`,
 * `FAIL` or `COMPLETE`. The closure is self-clearing, so calling it twice is a
 * no-op and the two edges that share one action need no coordination.
 *
 * The two payloads that carry it are exactly the two that carry the PLAN:
 * `NAVIGATE`, which the `CANCEL` / `FAIL` actions reach through
 * {@link RouterFSMContext.inflight} (neither edge has an `update`, so the field
 * is still there when they run), and `COMPLETE`, whose action must read its own
 * payload because its `update` — `commitNavigation` — clears `inflight` first.
 *
 * ⚑ **OPENING it is the `NAVIGATE` action's job since #1724, so the field is
 * written from inside the machine at both ends of the lifetime.** Opening it
 * from the pipeline leaves one site the machine cannot own: a navigation whose
 * `NAVIGATE` the table REFUSES would have a bridge standing and no edge to
 * close it. A refused edge runs no action, so from inside the machine such a
 * navigation opens nothing at all.
 *
 * ⚑ **`DISPOSE` is deliberately NOT in that set, and that is measured rather
 * than assumed.** An action there could not reach the scope anyway — the edge's
 * `update` (`resetState`) zeroes `inflight` BEFORE the action runs, and
 * `DISPOSE` carries no payload — but it would also have nothing to close:
 * instrumented over the whole functional tier, all 230 `DISPOSE` traversals came
 * from `IDLE` (228) or `STARTING` (2), never from inside the band, and not one
 * carried a live bridge. Eight deliberate attempts to reach an in-band
 * `DISPOSE` (from a guard, a `subscribeLeave` listener,
 * `onTransitionLeaveApprove`, an async guard's continuation, a parked
 * navigation, a `TRANSITION_CANCEL` listener, a Proxy `opts` getter and
 * `onTransitionStart`) all landed on the `IDLE` edge. The reason is structural:
 * `Router.dispose()` and `Router.stop()` both send `sendCancelIfPossible` FIRST,
 * and `CANCEL` is declared unconditionally on both in-band states, so the band
 * is always left through an edge that DOES close.
 */
interface CancellabilityScope {
  detachExternalBridge?: (() => void) | undefined;
}

export interface RouterPayloads {
  NAVIGATE: {
    toState: State;
    fromState?: State | undefined;
    /**
     * The navigation's own `AbortController`, when it has one (#1684). Read by
     * ONE reader, the `CANCEL` action — never by the table: the `NAVIGATE`
     * `update` only remembers the payload, and `mayCommit` asks the caller's
     * signal through `payload.externalSignal`, not this one. So the field
     * lives on the layer where effects already live (bookkeeping in `update`,
     * effects in the action — RFC-10a §6.2), and it is the same slot the
     * pipeline reads through `NavigationContext.controller`.
     */
    controller?: AbortController | undefined;
    /**
     * Where the `CANCEL` action RECORDS the cancellation, written by that action
     * and by nothing else (#1706).
     *
     * The controller above is allocated lazily, under conditions the pipeline
     * owns (`NavigationContext.controller` lists all three) — so a `CANCEL`
     * that lands before the first consumer opened one had nowhere to go: the
     * `?.` dropped it, and the controller opened moments later was born
     * UNABORTED, which satisfied the liveness fence and let the guards of an
     * already-cancelled navigation run. Recording the reason as DATA costs no
     * allocation, so the born-dead arcs still allocate zero
     * (`born-dead-navigation-1648.test.ts` counts them), and the pipeline's
     * `openController` aborts on birth when this is set.
     */
    cancelReason?: unknown;
    /**
     * The caller's `opts.signal` as the navigation snapshotted it at its entry
     * (`NavigationContext.externalSignal`, #1690) — read by the `NAVIGATE`
     * action, which OPENS the scope onto it (#1724).
     *
     * ⚠ Not `payload.opts.signal`: `NavigationOptions` is accessor- and
     * Proxy-backed by contract, so a second read is a call into application code
     * that may hand back another object — and the bridge would then be detached
     * from something it was never attached to. Same reason the COMPLETE payload
     * carries its own copy (#1717).
     */
    externalSignal?: AbortSignal | undefined;
  } & CancellabilityScope;
  LEAVE_APPROVE: { toState: State; fromState?: State | undefined };
  COMPLETE: {
    toState: State;
    fromState?: State | undefined;
    /**
     * The caller's options as the ENTRY copied them: `adoptNavigationOptions`
     * drops `signal` before the plan exists, so what the announcement hands
     * every plugin's `onTransitionSuccess` carries the caller's other keys and
     * not that one. The machine asks `externalSignal` below instead — the
     * snapshot it may rely on (#1690 / #1717).
     *
     * Required, because `completeTransition` is the ONE sender — which `tsc`
     * proves — and it hands over the plan, whose `opts` is required already.
     */
    opts: NavigationOptions;
    /**
     * The caller's `opts.signal` as the navigation snapshotted it at its entry
     * (`NavigationContext.externalSignal`, #1690), which is the ONLY form of
     * that signal the table may ask about (#1717).
     *
     * ⚠ **Not a convenience copy — `payload.opts.signal` is a DIFFERENT
     * question.** `NavigationOptions` is accessor- and Proxy-backed by contract,
     * so reading it is a call into application code and a later read may hand
     * back another object entirely. `mayCommit` runs inside `FSM.send`, and
     * inside `canSend` a second time, with the destructive post-leave cleanup
     * between them — so a re-read let the two evaluations of one `when`
     * disagree, refusing a healthy commit at the ask (band stuck in
     * `LEAVE_APPROVED`, nothing emitted) or at the send (`completeTransition`
     * returning a state the table never committed). The snapshot cannot
     * disagree with itself.
     */
    externalSignal?: AbortSignal | undefined;
  } & CancellabilityScope;
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
     * legal and means "not a navigation failure at all": the one no-navigation
     * sender (`Router.#unwindFailedStart`) takes `STARTING --FAIL--> IDLE`,
     * which carries no `when`. Two others were retired rather than moved — the
     * report in `RouterLifecycleNamespace` (a duplicate of that unwind) and the
     * early validation errors, which emit `TRANSITION_ERROR` directly since the
     * `READY→FAIL` edge went (RFC-10a §16.5).
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
   * Identity by reference is what makes a stamp unnecessary: a counter would
   * exist so a sender could mark its sends and the table compare marks, and a
   * caller cannot present a live identity it does not hold.
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
   * caller's `opts` (with any external `AbortSignal`), the guard maps and —
   * since #1684 — the navigation's OWN `AbortController` reachable until the
   * next navigation. Bounded and accepted on every count: a navigation that got
   * a controller at all has had it aborted by the time either of these two edges
   * is taken (a cancellation from inside the announce lands here with none —
   * allocation happens later), and it carries no listener (the bridge onto the
   * caller's signal is closed by the ACTION of whichever terminal edge was
   * taken, i.e. before this field is read — see
   * {@link RouterPayloads.NAVIGATE.detachExternalBridge}); the guard maps are owned by
   * `RouteLifecycleNamespace` regardless.
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
  /**
   * ⚑ `readonly` is the class guard for "the table owns the committed pair"
   * (#1749), and it is a COMPILE-TIME one: every holder of a
   * `RouterFSMContext` outside this module gets `TS2540` on a write, at the
   * moment of the edit rather than on the next tier run. It replaced the
   * second writer — `StateNamespace.clearCommitted`, reachable unguarded from
   * the published `./validation` subpath — with nothing.
   *
   * The three `update`s below take {@link MutableRouterFSMContext} instead.
   * That is not a hole: TypeScript does not track `readonly` across
   * assignment, so the engine still hands them this very object — the modifier
   * constrains the DECLARED type a foreign module holds, which is exactly the
   * surface an authority check cares about.
   */
  readonly current: State | undefined;
  readonly previous: State | undefined;
}

/**
 * The module-private mutable view of the context. Only the `update` functions
 * in this file take it, which is what makes the `readonly` above meaningful.
 */
type MutableRouterFSMContext = {
  -readonly [K in keyof RouterFSMContext]: RouterFSMContext[K];
};

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
 * The reason is structural rather than lucky: only the NAVIGATE update ever
 * puts a navigation THERE (the other two writes clear the field), so the
 * navigation a sender can name is by construction the one the machine adopted;
 * and both navigation-naming FAIL senders are already gated on
 * `deps.isTransitioning()` — the machine has to still be in the band — with
 * `asCancellation` restating a lost-liveness failure as `TRANSITION_CANCELLED`
 * — which `routeTransitionError` filters out before any send. Three adversarial
 * arcs (guard-redirect, a guard rejecting after a supersede landed, the
 * ROUTE_NOT_FOUND arc) were driven deliberately: all three end in `CANCELLED`
 * with no `TRANSITION_ERROR` at all. The `nav === undefined` half is dead for
 * a second reason — the one navigation-less sender (`Router.#unwindFailedStart`)
 * takes `STARTING --FAIL--> IDLE`, which carries no `when`.
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
 * The dead disjunct is dead by mutation as well as by argument: `mayFail →
 * true` kills nothing (#1648 §5.6), so the no-navigation branch is never TAKEN,
 * not merely never decisive.
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
 * table only from `STARTING`.** One sender satisfies it — `#unwindFailedStart`
 * — gated on `isStarting()` and declared on that edge alone. A second one is
 * the edit this predicate cannot
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
 *
 * ⚑ **The IDENTITY term has no killing test, and since #1719 it cannot have one
 * — the same status `mayFail` above carries, reached the same way.** Its only
 * killer was `commit-ask-snapshot-1649 › refuses the commit when an opts
 * getter supersedes the navigation`, which reached the cell through a read of
 * the caller's `opts` INSIDE the commit: a getter firing there could start a
 * second navigation after the outer one had passed every liveness check. No
 * such read remains, and with it no window in which a payload that is not
 * `ctx.inflight` can arrive at this edge. Measured both ways: before
 * #1719 dropping this term reds exactly that one test out of 4068; after it,
 * nothing out of 4069.
 *
 * ⛔ **Not a coverage gap to close with a test — no test can reach it without
 * changing production code first.** Reaching it needs a second navigation parked
 * in `LEAVE_APPROVED` between the outer one's last liveness check and its ask,
 * and that window is empty by TWO independent constructions: above the ask stand
 * `hasRoute`, a `buildTransitionMeta` that reads the plan and `Object.freeze`,
 * none of which run application code; between the ask and the send stands only
 * `clearCanDeactivate`, which reads stored compiled forms rather than invoking
 * factories (#1649). The legal carriers were enumerated and each falls earlier:
 * an activation guard is caught by the liveness fence, `subscribeLeave` and
 * `onTransitionLeaveApprove` by the reentrancy ban, codecs and option callbacks
 * by the pre-start ban (#1610/#1665).
 *
 * It stays for the day either of those two constructions changes — the table is
 * the last thing between a superseded navigation and a commit, and one reference
 * comparison is what that costs. The failure mode without it is SILENT and not
 * small: the superseded navigation's `COMPLETE` would fire, `commitNavigation`
 * would write ITS state over the live one and clear `inflight`, the announcement
 * would report that as a success, and the live navigation would then find no
 * edge and resolve a state nobody committed.
 *
 * ⚠ **The third term asks the SNAPSHOT, and re-reading the caller's object
 * instead is the one edit it cannot survive (#1717).** This predicate runs
 * twice per commit — once for `canSend`'s ask, once inside the `send` it
 * permits — with `completeTransition`'s destructive post-leave cleanup between
 * them. `opts` is accessor- and Proxy-backed by contract, so `opts.signal`
 * there is a call into application code that may answer differently each time:
 * a stranger at the ask refused a healthy commit without moving the machine
 * (band stuck in `LEAVE_APPROVED`, no `TRANSITION_CANCEL` for anyone), a
 * stranger at the send made `completeTransition` return a state the table never
 * committed. {@link RouterPayloads.COMPLETE.externalSignal} is the one object
 * the navigation was actually set up with, and it cannot disagree with itself.
 */
const mayCommit = (
  ctx: RouterFSMContext,
  payload: RouterPayloads["COMPLETE"] | undefined,
): boolean =>
  payload !== undefined &&
  payload === ctx.inflight &&
  payload.externalSignal?.aborted !== true;

/**
 * The pair shift, and the ONLY place it happens for a navigation commit. It
 * runs as an `update`, i.e. after the machine has already decided the
 * transition fires — so "committed" and "announced" cannot come apart.
 */
const commitState = (ctx: MutableRouterFSMContext, state: State): void => {
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
const clearCurrent = (ctx: MutableRouterFSMContext): void => {
  ctx.previous = ctx.current;
  ctx.current = undefined;
};

/** `dispose()` — zeroes BOTH cells at once, no shift. */
const resetState = (ctx: MutableRouterFSMContext): void => {
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
 *    category by construction. ⚠ FIVE is a count of call sites, so it moves
 *    with them (#1672): re-read it from the code rather than quoting this line,
 *    which is how a stale figure reaches an analysis that cites the docblock.
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
/**
 * The band's `CANCEL` edges are unconditional BY TYPE, not by discipline
 * (#1681).
 *
 * Sharpening the table's own declaration type to the STRING form for this one
 * event in these two states means the object form — the only way to spell a
 * `when` — does not compile there. `TS2322`, at the edge itself, instead of a
 * comment two files away from what it protects.
 *
 * What it protects is a NEIGHBOURING edge's unreachability.
 * `abortPreviousNavigation` leaves the band through `canCancel()` =
 * `canSend(CANCEL)`, so while these edges refuse nothing, `sendNavigate` is only
 * ever reached from `READY` — measured, 0 of 3593 sends came from inside the
 * band — and the two `NAVIGATE` self-loops stay untraversed. A `when` here makes
 * the self-loop reachable (measured: a send from `LEAVE_APPROVED`), which is
 * condition 3 of the false-green documented on the `READY` `NAVIGATE` edge.
 *
 * ⚠ It is keyed off `routerStates` / `routerEvents` rather than off string
 * literals, so renaming a state or the event moves the constraint with them
 * instead of silently detaching it — the failure mode a hand-written `"CANCEL"`
 * would have.
 */
type UnconditionalBandCancel = Readonly<
  Record<
    typeof routerStates.TRANSITION_STARTED | typeof routerStates.LEAVE_APPROVED,
    Readonly<Partial<Record<typeof routerEvents.CANCEL, RouterState>>>
  >
>;

/**
 * The edges that are ABSENT on purpose — declared as `never` so adding one back
 * is a compile error rather than a silent behaviour change.
 *
 * ⚑ **An absence is the hardest thing in this table to protect, and that is
 * structural rather than accidental.** A test exercises what happens; there is
 * no arc to exercise for an edge that does not exist, so every one of these
 * lived in a comment saying "and its absence is the answer, not an omission".
 * Adding the edge back makes the comment false and nothing else — no test walks
 * the arc it opens, because until that moment the arc was unreachable. Spelling
 * the absence in the type is the only mechanism that speaks at the moment of
 * the edit.
 *
 * Each entry is a decision with its own reason, kept at the state it belongs to:
 *
 * - **`STARTING` has no `NAVIGATE` and no `SYSTEM_COMMIT`.** Together they ARE
 *   the pre-boot window (#1647): a navigation or a 404 commit attempted from a
 *   start interceptor is refused by the table itself, so the window needs no
 *   facade predicate of its own.
 * - **`READY` has no `FAIL`.** Its absence is the answer to RFC-10a §16.5: the
 *   two senders it existed for are REPORTS to observers, not failures of a
 *   transition, so a stale `FAIL` there is a table no-op structurally — stronger
 *   than the `when` predicate that was drafted for it.
 * - **The band has no `STOP`.** `stop()` from inside a transition is routed
 *   through `CANCEL` first; leaving `STOP` undeclared is what makes the
 *   terminate path go through the cancellation machinery instead of around it.
 * - **`DISPOSED` has nothing at all.** The machine cannot be resurrected — the
 *   sole authority over state is the table, and this is where that ends
 *   (#1169 D-full).
 *
 * ⚠ Only absences that were already DOCUMENTED as load-bearing are listed. An
 * edge nobody has needed yet is not the same as an edge nobody may add, and
 * freezing the second kind would turn this from a lock into a cage.
 */
type DeclaredAbsences = Readonly<{
  [routerStates.STARTING]: Readonly<
    Partial<
      Record<
        typeof routerEvents.NAVIGATE | typeof routerEvents.SYSTEM_COMMIT,
        never
      >
    >
  >;
  [routerStates.READY]: Readonly<
    Partial<Record<typeof routerEvents.FAIL, never>>
  >;
  [routerStates.TRANSITION_STARTED]: Readonly<
    Partial<Record<typeof routerEvents.STOP, never>>
  >;
  [routerStates.LEAVE_APPROVED]: Readonly<
    Partial<Record<typeof routerEvents.STOP, never>>
  >;
  [routerStates.DISPOSED]: Readonly<Partial<Record<RouterEvent, never>>>;
}>;

const routerTransitions: TransitionTable<
  RouterState,
  RouterEvent,
  RouterFSMContext,
  RouterPayloads
> &
  UnconditionalBandCancel &
  DeclaredAbsences = {
  [routerStates.IDLE]: {
    [routerEvents.START]: routerStates.STARTING,
    [routerEvents.DISPOSE]: {
      target: routerStates.DISPOSED,
      update: resetState,
    },
  },
  [routerStates.STARTING]: {
    // ⚑ Neither `NAVIGATE` nor `SYSTEM_COMMIT` is declared here — see
    // `DeclaredAbsences` above the table, which refuses to compile them back.
    // WHY they are absent is measured, and that part belongs at the edge: one
    // `SYSTEM_COMMIT` was added on the strength of the phase-4.1 spikes
    // ("`start()` with `allowNotFound` commits its 404 while still STARTING; so
    // does a `replace()` inside an async start interceptor") and both claims are
    // false against this code: `RouterLifecycleNamespace.start` calls
    // `completeStart()` — which sends STARTED and leaves STARTING — BEFORE
    // `navigateToNotFound`, an order standing since #123 (2026-02-20); and the
    // `replace()` revalidation commits only when a state IS committed, which
    // means start finished. Both arcs traced through
    // `READY --SYSTEM_COMMIT--> READY`, no test traversed the STARTING edge,
    // and removing it failed none.
    //
    // Consequence worth knowing: a system commit attempted from STARTING is
    // now LOUD. `systemCommit()` asks `canSend` first and THROWS, so an arc
    // nobody has named surfaces instead of silently not committing.
    //
    // ⚠ The code is `ROUTER_NOT_STARTED`, not `ROUTER_DISPOSED`. The gate is
    // `canSend(SYSTEM_COMMIT)` (#1644), which refuses a LIVE router that is
    // merely starting or mid-transition as well as a disposed one, and the
    // codes are split accordingly (`EventBusNamespace.#refuseSystemCommit`):
    // four arms, one code apart — disposed → `ROUTER_DISPOSED`; mid-transition,
    // STARTING and "not started at all" → `ROUTER_NOT_STARTED`, each with its
    // own message (the boot window's is #1647).
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
    // `send(NAVIGATE, plan) === TRANSITION_STARTED` stands in for "the edge
    // fired" — inexactly, see below — and `beginTransition` refuses a
    // navigation for which it did NOT: user
    // code (a `stop()` from a `forwardState` interceptor) can drive the machine
    // out of the band between `canNavigate()` and the send, and such a
    // navigation is born dead: never announced, with nothing to carry it.
    // ⚠ **The test is inexact in BOTH directions, and one of them is
    // load-bearing (#1681).**
    //
    // FALSE-RED — it reports `false` for an edge that DID fire, whenever
    // something moved the machine off TRANSITION_STARTED before `send`
    // returned: `send` reads `this.#state` after the update, the action AND the
    // listeners, and the `NAVIGATE` action is where `TRANSITION_START` is
    // announced. A `stop()`, a `dispose()` or an aborted `opts.signal` from a
    // plugin's `onTransitionStart` all land there. Measured over the functional
    // tier, and on every one of them the refusal is RIGHT — the count lives with
    // the reader of this outcome (`executeNavigation`'s `startTransition`
    // block), which re-measures it. This is why neither candidate replacement
    // was taken: `ctx.inflight === payload` and `canSend` before the send both
    // report those sends as fired.
    //
    // FALSE-GREEN — a refused `when` would return the same TRANSITION_STARTED
    // the send started from. That needs THREE things at once, not one:
    //   1. the `when` on the SELF-LOOP (source TRANSITION_STARTED) — a refusal
    //      on this edge returns READY, which the test reads correctly;
    //   2. it must be PAYLOAD-dependent — `canBeginTransition()` already asks
    //      `canSend(NAVIGATE)` upstream, so a context-only condition is refused
    //      before `sendNavigate` is reached at all (with `ROUTER_NOT_STARTED`,
    //      which is its own problem — #1696);
    //   3. and the machine must still be in the band at send time, which today
    //      requires a `when` on `CANCEL` (see that edge).
    // Reproduced under all three; the cost is wasted work and a misleading
    // code, not corruption — the fence, `mayCommit` and `mayFail` all compare
    // identity, so a plan the machine never adopted passes none of them.
    //
    // If that day comes the remedy is `canSend(NAVIGATE, payload)` AND this
    // comparison, not one instead of the other: the ask catches the condition
    // on any edge, the comparison keeps the six announce-window refusals.
    [routerEvents.NAVIGATE]: {
      target: routerStates.TRANSITION_STARTED,
      update: beginNavigation,
    },
    // ⚑ No FAIL edge from READY — the type refuses to compile one back
    // (`DeclaredAbsences`), and RFC-10a §16.5 is answered by WHY: the edge
    // existed for exactly two
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
    // codebase, not a runtime scenario, and the fence is pinned by tests of its
    // own — 13 today, four when this was measured with the predicate and
    // without it alike. The unreachability is structural:
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
    //
    // ⚠ **And that unconditionality is load-bearing for a NEIGHBOURING edge
    // (#1681) — which is why it is now the TYPE's job**: see
    // `UnconditionalBandCancel` above the table. A `when` here does not compile.
    [routerEvents.CANCEL]: routerStates.READY,
    [routerEvents.FAIL]: { target: routerStates.READY, when: mayFail },
    // `dispose()` from inside a transition takes THIS edge — the band declares
    // no STOP (`DeclaredAbsences`) — so it is the one that has to zero
    // everything.
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
    // `dispose()` from inside a transition takes THIS edge — the band declares
    // no STOP (`DeclaredAbsences`) — so it is the one that has to zero
    // everything.
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
