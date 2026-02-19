// packages/core/src/fsm/transitionFSM.ts

import { FSM } from "@real-router/fsm";

import type { FSMConfig } from "@real-router/fsm";
import type { NavigationOptions, State } from "@real-router/types";

/**
 * Transition FSM states.
 *
 * - IDLE: No transition in progress
 * - RUNNING: Transition is executing
 */
export const transitionStates = {
  IDLE: "IDLE",
  RUNNING: "RUNNING",
} as const;

export type TransitionFSMState =
  (typeof transitionStates)[keyof typeof transitionStates];

/**
 * Transition FSM events.
 *
 * - START: Begin transition
 * - DONE: Transition completed successfully
 * - BLOCKED: Transition blocked by guard or middleware
 * - ERROR: Transition failed with error
 * - CANCEL: Transition cancelled
 */
export const transitionEvents = {
  START: "START",
  DONE: "DONE",
  BLOCKED: "BLOCKED",
  ERROR: "ERROR",
  CANCEL: "CANCEL",
} as const;

export type TransitionEvent =
  (typeof transitionEvents)[keyof typeof transitionEvents];

/**
 * Typed payloads for transition FSM events.
 *
 * All events have payloads in Release 1.
 */
export interface TransitionPayloads {
  START: {
    toState: State;
    fromState: State | undefined;
  };
  DONE: {
    state: State;
    fromState: State | undefined;
    opts: NavigationOptions;
  };
  BLOCKED: {
    state: State;
    fromState: State | undefined;
    error: unknown;
  };
  ERROR: {
    state: State;
    fromState: State | undefined;
    error: unknown;
  };
  CANCEL: {
    toState: State;
    fromState: State | undefined;
  };
}

/**
 * Transition FSM configuration.
 *
 * Transitions:
 * - IDLE → RUNNING (START)
 * - RUNNING → IDLE (DONE, BLOCKED, ERROR, CANCEL)
 */
const transitionFSMConfig: FSMConfig<
  TransitionFSMState,
  TransitionEvent,
  null
> = {
  initial: transitionStates.IDLE,
  context: null,
  transitions: {
    [transitionStates.IDLE]: {
      [transitionEvents.START]: transitionStates.RUNNING,
    },
    [transitionStates.RUNNING]: {
      [transitionEvents.DONE]: transitionStates.IDLE,
      [transitionEvents.BLOCKED]: transitionStates.IDLE,
      [transitionEvents.ERROR]: transitionStates.IDLE,
      [transitionEvents.CANCEL]: transitionStates.IDLE,
    },
  },
};

/**
 * Factory function to create a transition FSM instance.
 *
 * @returns FSM instance with initial state "IDLE"
 */
export function createTransitionFSM(): FSM<
  TransitionFSMState,
  TransitionEvent,
  null,
  TransitionPayloads
> {
  return new FSM<TransitionFSMState, TransitionEvent, null, TransitionPayloads>(
    transitionFSMConfig,
  );
}
