/**
 * Plugin lifecycle method names
 */
export type PluginMethod =
  | "onStart"
  | "onStop"
  | "onTransitionStart"
  | "onTransitionLeaveApprove"
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
  | "$$leaveApprove"
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
  | "TRANSITION_LEAVE_APPROVE"
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
  | "DISPOSED"
  | "PLUGIN_CONFLICT"
  | "CONTEXT_NAMESPACE_ALREADY_CLAIMED";

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
  | "ROUTER_NOT_STOPPED"
  | "TRANSITION_CANCELLED"
  | "ROUTER_DISPOSED"
  | "PLUGIN_CONFLICT"
  | "CONTEXT_NAMESPACE_ALREADY_CLAIMED"
  | "REENTRANT_NAVIGATION"
  | "REENTRANT_TREE_MUTATION";

/**
 * Mapping of event keys to plugin methods
 */
export interface EventToPluginMap {
  readonly ROUTER_START: "onStart";
  readonly ROUTER_STOP: "onStop";
  readonly TRANSITION_START: "onTransitionStart";
  readonly TRANSITION_LEAVE_APPROVE: "onTransitionLeaveApprove";
  readonly TRANSITION_CANCEL: "onTransitionCancel";
  readonly TRANSITION_SUCCESS: "onTransitionSuccess";
  readonly TRANSITION_ERROR: "onTransitionError";
}

/**
 * Mapping of event keys to event names
 */
export interface EventToNameMap {
  readonly ROUTER_START: "$start";
  readonly ROUTER_STOP: "$stop";
  readonly TRANSITION_START: "$$start";
  readonly TRANSITION_LEAVE_APPROVE: "$$leaveApprove";
  readonly TRANSITION_CANCEL: "$$cancel";
  readonly TRANSITION_SUCCESS: "$$success";
  readonly TRANSITION_ERROR: "$$error";
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
  readonly ROUTER_NOT_STARTED: "NOT_STARTED";
  readonly NO_START_PATH_OR_STATE: "NO_START_PATH_OR_STATE";
  readonly ROUTER_ALREADY_STARTED: "ALREADY_STARTED";
  readonly ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND";
  readonly SAME_STATES: "SAME_STATES";
  readonly CANNOT_DEACTIVATE: "CANNOT_DEACTIVATE";
  readonly CANNOT_ACTIVATE: "CANNOT_ACTIVATE";
  readonly TRANSITION_ERR: "TRANSITION_ERR";
  readonly ROUTER_NOT_STOPPED: "NOT_STOPPED";
  readonly TRANSITION_CANCELLED: "CANCELLED";
  readonly ROUTER_DISPOSED: "DISPOSED";
  readonly PLUGIN_CONFLICT: "PLUGIN_CONFLICT";
  readonly CONTEXT_NAMESPACE_ALREADY_CLAIMED: "CONTEXT_NAMESPACE_ALREADY_CLAIMED";
  readonly REENTRANT_NAVIGATION: "REENTRANT_NAVIGATION";
  readonly REENTRANT_TREE_MUTATION: "REENTRANT_TREE_MUTATION";
  readonly WRONG_CHANNEL: "WRONG_CHANNEL";
}
