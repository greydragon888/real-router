// packages/core/src/routerFSM.ts

import { FSM } from "./utils/fsm";

import type { NavigationOptions, State } from "./types";
import type { FSMConfig } from "./utils/fsm";

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
}

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
const routerFSMConfig: FSMConfig<RouterState, RouterEvent, null> = {
  initial: routerStates.IDLE,
  context: null,
  transitions: {
    [routerStates.IDLE]: {
      [routerEvents.START]: routerStates.STARTING,
      [routerEvents.DISPOSE]: routerStates.DISPOSED,
    },
    [routerStates.STARTING]: {
      [routerEvents.STARTED]: routerStates.READY,
      [routerEvents.FAIL]: routerStates.IDLE,
      [routerEvents.STOP]: routerStates.IDLE,
      [routerEvents.DISPOSE]: routerStates.DISPOSED,
    },
    [routerStates.READY]: {
      [routerEvents.NAVIGATE]: routerStates.TRANSITION_STARTED,
      [routerEvents.FAIL]: routerStates.READY,
      [routerEvents.STOP]: routerStates.IDLE,
      [routerEvents.DISPOSE]: routerStates.DISPOSED,
    },
    [routerStates.TRANSITION_STARTED]: {
      [routerEvents.NAVIGATE]: routerStates.TRANSITION_STARTED,
      [routerEvents.LEAVE_APPROVE]: routerStates.LEAVE_APPROVED,
      [routerEvents.CANCEL]: routerStates.READY,
      [routerEvents.FAIL]: routerStates.READY,
      [routerEvents.DISPOSE]: routerStates.DISPOSED,
    },
    [routerStates.LEAVE_APPROVED]: {
      [routerEvents.NAVIGATE]: routerStates.TRANSITION_STARTED,
      [routerEvents.COMPLETE]: routerStates.READY,
      [routerEvents.CANCEL]: routerStates.READY,
      [routerEvents.FAIL]: routerStates.READY,
      [routerEvents.DISPOSE]: routerStates.DISPOSED,
    },
    [routerStates.DISPOSED]: {},
  },
};

/**
 * Factory function to create a router FSM instance.
 *
 * @returns FSM instance with initial state "IDLE"
 */
export function createRouterFSM(): FSM<
  RouterState,
  RouterEvent,
  null,
  RouterPayloads
> {
  return new FSM<RouterState, RouterEvent, null, RouterPayloads>(
    routerFSMConfig,
  );
}
