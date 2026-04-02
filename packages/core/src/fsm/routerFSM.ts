// packages/core/src/fsm/routerFSM.ts

import { FSM } from "@real-router/fsm";

import type { FSMConfig } from "@real-router/fsm";

/**
 * Router FSM states.
 *
 * - IDLE: Router not started or stopped
 * - STARTING: Router is initializing
 * - READY: Router is ready for navigation
 * - TRANSITION_STARTED: Navigation in progress
 * - DISPOSED: Router has been disposed (R2+)
 */
export const routerStates = {
  IDLE: "IDLE",
  STARTING: "STARTING",
  READY: "READY",
  TRANSITION_STARTED: "TRANSITION_STARTED",
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
  COMPLETE: "COMPLETE",
  FAIL: "FAIL",
  CANCEL: "CANCEL",
  STOP: "STOP",
  DISPOSE: "DISPOSE",
} as const;

export type RouterEvent = (typeof routerEvents)[keyof typeof routerEvents];

/**
 * Typed payloads for router FSM events.
 *
 * Events without entries have no payload.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- payloads stored in EventBusNamespace fields (N8+N9 optimization)
export interface RouterPayloads {}

/**
 * Router FSM configuration.
 *
 * Transitions:
 * - IDLE → STARTING (START), DISPOSED (DISPOSE)
 * - STARTING → READY (STARTED), IDLE (FAIL)
 * - READY → TRANSITION_STARTED (NAVIGATE), READY (FAIL, self-loop for early validation errors), IDLE (STOP)
 * - TRANSITION_STARTED → TRANSITION_STARTED (NAVIGATE, self-loop for canSend), READY (COMPLETE, CANCEL, FAIL)
 * - DISPOSED → (no transitions)
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
    },
    [routerStates.READY]: {
      [routerEvents.NAVIGATE]: routerStates.TRANSITION_STARTED,
      [routerEvents.FAIL]: routerStates.READY,
      [routerEvents.STOP]: routerStates.IDLE,
    },
    [routerStates.TRANSITION_STARTED]: {
      [routerEvents.NAVIGATE]: routerStates.TRANSITION_STARTED,
      [routerEvents.COMPLETE]: routerStates.READY,
      [routerEvents.CANCEL]: routerStates.READY,
      [routerEvents.FAIL]: routerStates.READY,
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
