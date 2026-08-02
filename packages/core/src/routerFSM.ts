// packages/core/src/routerFSM.ts

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

const beginNavigation = (
  ctx: RouterFSMContext,
  payload: RouterPayloads["NAVIGATE"] | undefined,
): void => {
  ctx.epoch++;
  ctx.inflightToState = payload?.toState;
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
 */
const routerTransitions: TransitionTable<
  RouterState,
  RouterEvent,
  RouterFSMContext,
  RouterPayloads
> = {
  [routerStates.IDLE]: {
    [routerEvents.START]: routerStates.STARTING,
    [routerEvents.DISPOSE]: routerStates.DISPOSED,
  },
  [routerStates.STARTING]: {
    [routerEvents.STARTED]: routerStates.READY,
    // ⚠ Two SYSTEM_COMMIT edges are needed, not one, and this is the
    // non-obvious half: `start()` with `allowNotFound` commits its 404 while
    // the machine is still STARTING, and so does a `replace()` running inside
    // an async start interceptor (#1204). Confirmed independently on both
    // ruptures by the phase-4.1 spikes.
    [routerEvents.SYSTEM_COMMIT]: routerStates.STARTING,
    [routerEvents.FAIL]: routerStates.IDLE,
    [routerEvents.STOP]: routerStates.IDLE,
    [routerEvents.DISPOSE]: routerStates.DISPOSED,
  },
  [routerStates.READY]: {
    // The one NAVIGATE edge that is ever TRAVERSED, and therefore the one that
    // bumps the epoch: `abortPreviousNavigation` drives the machine back to
    // READY before `sendNavigate` runs, so a supersede arrives here too.
    [routerEvents.NAVIGATE]: {
      target: routerStates.TRANSITION_STARTED,
      update: beginNavigation,
    },
    // ⚠ Unconditional on purpose. Its clients are the two `sendFailSafe` sites
    // (early validation errors, the plugin-facing report), which are re-routed
    // off the machine in S7 — the edge itself goes with them.
    [routerEvents.FAIL]: routerStates.READY,
    [routerEvents.SYSTEM_COMMIT]: routerStates.READY,
    [routerEvents.STOP]: routerStates.IDLE,
    [routerEvents.DISPOSE]: routerStates.DISPOSED,
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
    [routerEvents.LEAVE_APPROVE]: routerStates.LEAVE_APPROVED,
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
    // ⚠ `endNavigation` here too, and it is not decoration: the field it clears
    // used to be cleared UNCONDITIONALLY by the sender, while a table update
    // only runs when its edge fires. `dispose()` from inside a transition takes
    // this edge (STOP is not declared from here), so without it a disposed
    // router would keep the last in-flight `State` alive in its context.
    [routerEvents.DISPOSE]: {
      target: routerStates.DISPOSED,
      update: endNavigation,
    },
  },
  [routerStates.LEAVE_APPROVED]: {
    // Same permission bit as above — 29 tests depend on it being declared.
    [routerEvents.NAVIGATE]: {
      target: routerStates.TRANSITION_STARTED,
      update: beginNavigation,
    },
    // ⚠ `when: mayCommit` does NOT land here yet, and the order is why:
    // `completeTransition` calls `setState` BEFORE `send(COMPLETE)`, so a
    // refused COMPLETE would leave the state committed with no
    // `TRANSITION_SUCCESS` — the exact corrupting shape #1609 describes. The
    // condition arrives in S5 together with the commit becoming an `update`,
    // where there is no separate `setState` left to run ahead of it.
    [routerEvents.COMPLETE]: routerStates.READY,
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
    // ⚠ `endNavigation` here too, and it is not decoration: the field it clears
    // used to be cleared UNCONDITIONALLY by the sender, while a table update
    // only runs when its edge fires. `dispose()` from inside a transition takes
    // this edge (STOP is not declared from here), so without it a disposed
    // router would keep the last in-flight `State` alive in its context.
    [routerEvents.DISPOSE]: {
      target: routerStates.DISPOSED,
      update: endNavigation,
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
