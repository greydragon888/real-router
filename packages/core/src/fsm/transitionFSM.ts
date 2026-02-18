// packages/core/src/fsm/transitionFSM.ts

import { FSM } from "@real-router/fsm";

import type { FSMConfig } from "@real-router/fsm";
import type { NavigationOptions, State } from "@real-router/types";

/**
 * Transition FSM phases.
 *
 * - IDLE: No transition in progress
 * - RUNNING: Transition is executing
 */
export type TransitionPhase = "IDLE" | "RUNNING";

/**
 * Transition FSM events.
 *
 * - START: Begin transition
 * - DONE: Transition completed successfully
 * - BLOCKED: Transition blocked by guard or middleware
 * - ERROR: Transition failed with error
 * - CANCEL: Transition cancelled
 */
export type TransitionEvent = "START" | "DONE" | "BLOCKED" | "ERROR" | "CANCEL";

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
const transitionFSMConfig: FSMConfig<TransitionPhase, TransitionEvent, null> = {
  initial: "IDLE",
  context: null,
  transitions: {
    IDLE: {
      START: "RUNNING",
    },
    RUNNING: {
      DONE: "IDLE",
      BLOCKED: "IDLE",
      ERROR: "IDLE",
      CANCEL: "IDLE",
    },
  },
};

/**
 * Factory function to create a transition FSM instance.
 *
 * @returns FSM instance with initial state "IDLE"
 */
export function createTransitionFSM(): FSM<
  TransitionPhase,
  TransitionEvent,
  null,
  TransitionPayloads
> {
  return new FSM<TransitionPhase, TransitionEvent, null, TransitionPayloads>(
    transitionFSMConfig,
  );
}
