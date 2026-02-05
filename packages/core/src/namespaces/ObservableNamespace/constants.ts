// packages/core/src/namespaces/ObservableNamespace/constants.ts

import { events } from "../../constants";

import type { EventName } from "@real-router/types";

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
