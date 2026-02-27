// packages/core-types/modules/constants.ts

/**
 * Plugin lifecycle method names
 */
export type PluginMethod =
  | "onStart"
  | "onStop"
  | "onTransitionStart"
  | "onTransitionCancel"
  | "onTransitionSuccess"
  | "onTransitionError";

/**
 * Router event names
 */
export type EventName =
  | "$start"
  | "$stop"
  | "$$start"
  | "$$cancel"
  | "$$success"
  | "$$error";

/**
 * Event type keys
 */
export type EventsKeys =
  | "ROUTER_START"
  | "ROUTER_STOP"
  | "TRANSITION_START"
  | "TRANSITION_CANCEL"
  | "TRANSITION_SUCCESS"
  | "TRANSITION_ERROR";

/**
 * Error code values
 */
export type ErrorCodeValues =
  | "NOT_STARTED"
  | "NO_START_PATH_OR_STATE"
  | "ALREADY_STARTED"
  | "ROUTE_NOT_FOUND"
  | "SAME_STATES"
  | "CANNOT_DEACTIVATE"
  | "CANNOT_ACTIVATE"
  | "TRANSITION_ERR"
  | "CANCELLED"
  | "DISPOSED";

/**
 * Error code keys
 */
export type ErrorCodeKeys =
  | "ROUTER_NOT_STARTED"
  | "NO_START_PATH_OR_STATE"
  | "ROUTER_ALREADY_STARTED"
  | "ROUTE_NOT_FOUND"
  | "SAME_STATES"
  | "CANNOT_DEACTIVATE"
  | "CANNOT_ACTIVATE"
  | "TRANSITION_ERR"
  | "TRANSITION_CANCELLED"
  | "ROUTER_DISPOSED";

/**
 * Mapping of event keys to plugin methods
 */
export interface EventToPluginMap {
  readonly ROUTER_START: "onStart";
  readonly ROUTER_STOP: "onStop";
  readonly TRANSITION_START: "onTransitionStart";
  readonly TRANSITION_CANCEL: "onTransitionCancel";
  readonly TRANSITION_SUCCESS: "onTransitionSuccess";
  readonly TRANSITION_ERROR: "onTransitionError";
}

/**
 * Mapping of event keys to event names
 */
export interface EventToNameMap {
  ROUTER_START: "$start";
  ROUTER_STOP: "$stop";
  TRANSITION_START: "$$start";
  TRANSITION_CANCEL: "$$cancel";
  TRANSITION_SUCCESS: "$$success";
  TRANSITION_ERROR: "$$error";
}

/**
 * Mapping of event names to plugin method names.
 * Type-level computation from EventToNameMap + EventToPluginMap.
 */
export type EventMethodMap = {
  [K in EventsKeys as EventToNameMap[K]]: EventToPluginMap[K];
};

/**
 * Mapping of error code keys to their values
 */
export interface ErrorCodeToValueMap {
  ROUTER_NOT_STARTED: "NOT_STARTED";
  NO_START_PATH_OR_STATE: "NO_START_PATH_OR_STATE";
  ROUTER_ALREADY_STARTED: "ALREADY_STARTED";
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND";
  SAME_STATES: "SAME_STATES";
  CANNOT_DEACTIVATE: "CANNOT_DEACTIVATE";
  CANNOT_ACTIVATE: "CANNOT_ACTIVATE";
  TRANSITION_ERR: "TRANSITION_ERR";
  TRANSITION_CANCELLED: "CANCELLED";
  ROUTER_DISPOSED: "DISPOSED";
}
