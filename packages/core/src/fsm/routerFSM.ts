// packages/core/src/fsm/routerFSM.ts

import { FSM } from "@real-router/fsm";

import type { FSMConfig } from "@real-router/fsm";
import type { NavigationOptions, State } from "@real-router/types";

/**
 * Router FSM states.
 *
 * - IDLE: Router not started or stopped
 * - STARTING: Router is initializing
 * - READY: Router is ready for navigation
 * - TRANSITIONING: Navigation in progress
 * - DISPOSED: Router has been disposed (R2+)
 */
export const routerStates = {
  IDLE: "IDLE",
  STARTING: "STARTING",
  READY: "READY",
  TRANSITIONING: "TRANSITIONING",
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
export interface RouterPayloads {
  NAVIGATE: {
    toState: State;
    fromState: State | undefined;
  };
  COMPLETE: {
    state: State;
    fromState: State | undefined;
    opts: NavigationOptions;
  };
  FAIL: {
    toState?: State;
    fromState?: State | undefined;
    error?: unknown;
  };
  CANCEL: {
    toState: State;
    fromState: State | undefined;
  };
}

/**
 * Router FSM configuration.
 *
 * Transitions:
 * - IDLE → STARTING (START), DISPOSED (DISPOSE)
 * - STARTING → READY (STARTED), IDLE (FAIL)
 * - READY → TRANSITIONING (NAVIGATE), IDLE (STOP)
 * - TRANSITIONING → TRANSITIONING (NAVIGATE, self-loop for canSend), READY (COMPLETE, CANCEL, FAIL)
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
      [routerEvents.NAVIGATE]: routerStates.TRANSITIONING,
      [routerEvents.STOP]: routerStates.IDLE,
    },
    [routerStates.TRANSITIONING]: {
      [routerEvents.NAVIGATE]: routerStates.TRANSITIONING,
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
