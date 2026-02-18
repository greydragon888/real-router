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
export type RouterState =
  | "IDLE"
  | "STARTING"
  | "READY"
  | "TRANSITIONING"
  | "DISPOSED";

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
export type RouterEvent =
  | "START"
  | "STARTED"
  | "NAVIGATE"
  | "COMPLETE"
  | "FAIL"
  | "CANCEL"
  | "STOP"
  | "DISPOSE";

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
 * - STARTING → READY (STARTED), IDLE (FAIL, STOP)
 * - READY → TRANSITIONING (NAVIGATE), IDLE (STOP), DISPOSED (DISPOSE)
 * - TRANSITIONING → READY (COMPLETE, CANCEL, FAIL), IDLE (STOP)
 * - DISPOSED → (no transitions)
 */
const routerFSMConfig: FSMConfig<RouterState, RouterEvent, null> = {
  initial: "IDLE",
  context: null,
  transitions: {
    IDLE: {
      START: "STARTING",
      DISPOSE: "DISPOSED",
    },
    STARTING: {
      STARTED: "READY",
      FAIL: "IDLE",
      STOP: "IDLE",
    },
    READY: {
      NAVIGATE: "TRANSITIONING",
      STOP: "IDLE",
      DISPOSE: "DISPOSED",
    },
    TRANSITIONING: {
      COMPLETE: "READY",
      CANCEL: "READY",
      FAIL: "READY",
      STOP: "IDLE",
    },
    DISPOSED: {},
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
