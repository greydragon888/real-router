// packages/core/src/constants.ts

import type {
  EventToNameMap,
  EventToPluginMap,
  ErrorCodeToValueMap,
  ErrorCodeKeys,
  ErrorCodeValues,
  TransitionMeta,
} from "@real-router/types";

export type ConstantsKeys = "UNKNOWN_ROUTE";

export type Constants = Record<ConstantsKeys, string>;

// =============================================================================
// Error Codes (migrated from router-error)
// =============================================================================

export type ErrorCodes = Record<ErrorCodeKeys, ErrorCodeValues>;

/**
 * Error codes for router operations.
 * Used to identify specific failure scenarios in navigation and lifecycle.
 * Frozen to prevent accidental modifications.
 */
export const errorCodes: ErrorCodeToValueMap = Object.freeze({
  ROUTER_NOT_STARTED: "NOT_STARTED", // navigate() called before start()
  NO_START_PATH_OR_STATE: "NO_START_PATH_OR_STATE", // start() without initial route
  ROUTER_ALREADY_STARTED: "ALREADY_STARTED", // start() called twice
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND", // Navigation to non-existent route
  SAME_STATES: "SAME_STATES", // Navigate to current route without reload
  CANNOT_DEACTIVATE: "CANNOT_DEACTIVATE", // canDeactivate guard blocked navigation
  CANNOT_ACTIVATE: "CANNOT_ACTIVATE", // canActivate guard blocked navigation
  TRANSITION_ERR: "TRANSITION_ERR", // Generic transition failure
  TRANSITION_CANCELLED: "CANCELLED", // Navigation cancelled by user or new navigation
  ROUTER_DISPOSED: "DISPOSED", // Router has been disposed
  PLUGIN_CONFLICT: "PLUGIN_CONFLICT", // Plugin tried to extend router with already-existing property
  CONTEXT_NAMESPACE_ALREADY_CLAIMED: "CONTEXT_NAMESPACE_ALREADY_CLAIMED", // Plugin tried to claim a context namespace already owned by another plugin
});

/**
 * General router constants.
 * Special route names and identifiers.
 */
export const UNKNOWN_ROUTE = "@@router/UNKNOWN_ROUTE";

export const constants: Constants = {
  UNKNOWN_ROUTE,
};

/**
 * Plugin method names.
 * Maps to methods that plugins can implement to hook into router lifecycle.
 */
export const plugins: EventToPluginMap = {
  ROUTER_START: "onStart", // Plugin method called when router starts
  ROUTER_STOP: "onStop", // Plugin method called when router stops
  TRANSITION_START: "onTransitionStart", // Plugin method called when navigation begins
  TRANSITION_LEAVE_APPROVE: "onTransitionLeaveApprove", // Plugin method called when deactivation guards pass
  TRANSITION_CANCEL: "onTransitionCancel", // Plugin method called when navigation cancelled
  TRANSITION_SUCCESS: "onTransitionSuccess", // Plugin method called when navigation succeeds
  TRANSITION_ERROR: "onTransitionError", // Plugin method called when navigation fails
};

/**
 * Event names for router event system.
 * Used with addEventListener/removeEventListener for reactive subscriptions.
 */
export const events: EventToNameMap = {
  ROUTER_START: "$start", // Emitted when router.start() succeeds
  ROUTER_STOP: "$stop", // Emitted when router.stop() is called
  TRANSITION_START: "$$start", // Emitted when navigation begins
  TRANSITION_LEAVE_APPROVE: "$$leaveApprove", // Emitted when deactivation guards pass
  TRANSITION_CANCEL: "$$cancel", // Emitted when navigation is cancelled
  TRANSITION_SUCCESS: "$$success", // Emitted when navigation completes successfully
  TRANSITION_ERROR: "$$error", // Emitted when navigation fails
};

export const DEFAULT_LIMITS = {
  maxDependencies: 100,
  maxPlugins: 50,
  maxListeners: 10_000,
  warnListeners: 1000,
  maxEventDepth: 5,
  maxLifecycleHandlers: 200,
} as const;

export const EMPTY_PARAMS: Readonly<Record<string, never>> = Object.freeze({});

const FROZEN_EMPTY_SEGMENTS = Object.freeze({
  deactivated: Object.freeze([]) as unknown as string[],
  activated: Object.freeze([]) as unknown as string[],
  intersection: "",
});

export const DEFAULT_TRANSITION = Object.freeze({
  phase: "activating",
  reason: "success",
  segments: FROZEN_EMPTY_SEGMENTS,
}) as TransitionMeta;
