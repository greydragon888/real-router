// packages/core/src/namespaces/ObservableNamespace/constants.ts

import { events } from "../../constants";

import type { EventName } from "@real-router/types";

/**
 * Max recursion depth to prevent stack overflow from circular event triggers
 */
export const MAX_EVENT_DEPTH = 5;

/**
 * Hard limit to prevent memory leaks from exponential listener creation
 */
export const MAX_LISTENERS_HARD_LIMIT = 10_000;

/**
 * Valid event names for validation
 */
export const validEventNames = new Set<EventName>([
  events.ROUTER_START,
  events.TRANSITION_START,
  events.TRANSITION_SUCCESS,
  events.TRANSITION_ERROR,
  events.TRANSITION_CANCEL,
  events.ROUTER_STOP,
]);
