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
 */
export interface RouterPayloads {
  NAVIGATE: { toState: State; fromState?: State | undefined };
  LEAVE_APPROVE: {
    epoch: number;
    toState: State;
    fromState?: State | undefined;
  };
  COMPLETE: {
    epoch: number;
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
     * The navigation this failure belongs to. `undefined` is legal and means
     * "not a navigation failure at all" — start-unwind and the READY self-loop
     * of early validation errors both send without one.
     */
    epoch?: number | undefined;
    toState?: State | undefined;
    fromState?: State | undefined;
    error?: unknown;
  };
  CANCEL: { toState: State; fromState?: State | undefined; reason?: unknown };
  SYSTEM_COMMIT: {
    toState: State;
    fromState?: State | undefined;
    opts: NavigationOptions;
  };
}

/**
 * The machine's own memory (RFC-10a §7.1). Two fields, both mutated ONLY by
 * table updates — never from outside.
 *
 * There is deliberately no `inflightFromState`: every cancel source already
 * carries `fromState` (it reads the committed state), and after the ownership
 * move it would duplicate the context's own `current` — RFC-10a §16.6.
 */
export interface RouterFSMContext {
  /**
   * Navigation epoch — the former `InFlightNavigation.#id`, promoted into the
   * machine. Bumped ONLY by the NAVIGATE update.
   *
   * ⚠ INTERNAL. Never declared as a public snapshot version: doing so turns
   * today's "we promised nothing" into a breaking change (plan §11.C2).
   */
  epoch: number;
  /** Target of the in-flight navigation — the former `EventBus.#currentToState`. */
  inflightToState: State | undefined;
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
    epoch: 0,
    inflightToState: undefined,
    current: undefined,
    previous: undefined,
  };
}

/**
 * A FAIL with no epoch is legal (start-unwind, early validation errors); one
 * carrying a FOREIGN epoch is stale — it belongs to a navigation that has
 * already been superseded, and letting it through would move the machine out
 * from under the live one, turning its COMPLETE into a table no-op (#1609).
 */
const mayFail = (
  ctx: RouterFSMContext,
  payload: RouterPayloads["FAIL"] | undefined,
): boolean => payload?.epoch === undefined || payload.epoch === ctx.epoch;

/** Nothing in flight, nothing to cancel. */
const hasInflight = (ctx: RouterFSMContext): boolean =>
  ctx.inflightToState !== undefined;

/**
 * The commit gate, as a condition on the edge the commit takes. Both halves of
 * the interim check it replaces are here: a superseded navigation carries a
 * FOREIGN epoch (the nested NAVIGATE bumped it), and a terminated router has no
 * COMPLETE edge at all — COMPLETE is declared from LEAVE_APPROVED only.
 */
const mayCommit = (
  ctx: RouterFSMContext,
  payload: RouterPayloads["COMPLETE"] | undefined,
): boolean =>
  payload?.epoch === ctx.epoch && payload.opts?.signal?.aborted !== true;

/** A leave approval belongs to the navigation that asked for it. */
const isOwnEpoch = (
  ctx: RouterFSMContext,
  payload: RouterPayloads["LEAVE_APPROVE"] | undefined,
): boolean => payload?.epoch === ctx.epoch;

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
  ctx.inflightToState = undefined;
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
  ctx.inflightToState = undefined;
};

const beginNavigation = (
  ctx: RouterFSMContext,
  payload: RouterPayloads["NAVIGATE"],
): void => {
  ctx.epoch++;
  ctx.inflightToState = payload.toState;
};

const endNavigation = (ctx: RouterFSMContext): void => {
  ctx.inflightToState = undefined;
};

/**
 * Router FSM configuration.
 *
 * Transitions:
 * - IDLE → STARTING (START), DISPOSED (DISPOSE)
 * - STARTING → READY (STARTED), IDLE (FAIL, STOP), DISPOSED (DISPOSE)
 * - READY → TRANSITION_STARTED (NAVIGATE), READY (FAIL, self-loop for early validation errors), IDLE (STOP), DISPOSED (DISPOSE)
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
 *    supersede legal. Removing them fails 9 and 29 tests respectively — with
 *    supersede dying SILENTLY at the predicate, not at the send. `canSend` is
 *    read exactly three times in core (NAVIGATE / START / CANCEL); an edge for
 *    one of those events is a candidate for this category by construction.
 * 3. **Fail-safe** — dead on every healthy flow and there precisely for the
 *    unhealthy one. The three direct `DISPOSE` edges (#660) are these: 3881
 *    tests pass without them because no test reaches the state they exist for.
 *
 * The corollary for the two `NAVIGATE` self-loops specifically: their `update`
 * is dead code (the epoch is bumped by the READY edge, the only one that
 * fires), and it is kept anyway so the three declarations stay identical —
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
    [routerEvents.STARTED]: routerStates.READY,
    // ⚠ Two SYSTEM_COMMIT edges are needed, not one, and this is the
    // non-obvious half: `start()` with `allowNotFound` commits its 404 while
    // the machine is still STARTING, and so does a `replace()` running inside
    // an async start interceptor (#1204). Confirmed independently on both
    // ruptures by the phase-4.1 spikes.
    [routerEvents.SYSTEM_COMMIT]: {
      target: routerStates.STARTING,
      update: commitSystemState,
    },
    [routerEvents.FAIL]: routerStates.IDLE,
    [routerEvents.STOP]: { target: routerStates.IDLE, update: clearCurrent },
    [routerEvents.DISPOSE]: {
      target: routerStates.DISPOSED,
      update: resetState,
    },
  },
  [routerStates.READY]: {
    // The one NAVIGATE edge that is ever TRAVERSED, and therefore the one that
    // bumps the epoch: `abortPreviousNavigation` drives the machine back to
    // READY before `sendNavigate` runs, so a supersede arrives here too.
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
    // kills supersede silently at `canNavigate()` — 9 tests.
    [routerEvents.NAVIGATE]: {
      target: routerStates.TRANSITION_STARTED,
      update: beginNavigation,
    },
    [routerEvents.LEAVE_APPROVE]: {
      target: routerStates.LEAVE_APPROVED,
      when: isOwnEpoch,
    },
    [routerEvents.CANCEL]: {
      target: routerStates.READY,
      when: hasInflight,
      update: endNavigation,
    },
    [routerEvents.FAIL]: {
      target: routerStates.READY,
      when: mayFail,
      update: endNavigation,
    },
    // `dispose()` from inside a transition takes THIS edge — STOP is not
    // declared here — so it is the one that has to zero everything.
    [routerEvents.DISPOSE]: {
      target: routerStates.DISPOSED,
      update: resetState,
    },
  },
  [routerStates.LEAVE_APPROVED]: {
    // Same permission bit as above — 29 tests depend on it being declared.
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
    [routerEvents.CANCEL]: {
      target: routerStates.READY,
      when: hasInflight,
      update: endNavigation,
    },
    [routerEvents.FAIL]: {
      target: routerStates.READY,
      when: mayFail,
      update: endNavigation,
    },
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
    // at epoch 0 with nothing in flight (RFC-10a §6.5).
    context: createInitialRouterFSMContext(),
    transitions: routerTransitions,
  });
}
