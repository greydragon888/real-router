// packages/router6/modules/constants.ts

import type {
  EventToNameMap,
  EventToPluginMap,
  ErrorCodeToValueMap,
  ErrorCodeKeys,
  ErrorCodeValues,
} from "router6-types";

/**
 * Internal Symbol for storing the route tree.
 * Using Symbol to simulate a "private" property that won't appear in Object.keys().
 *
 * @internal
 */
export const ROOT_TREE_SYMBOL = Symbol("router6.routeTree");

/**
 * Internal Symbol for storing route definitions.
 * Used for dynamic route addition support.
 *
 * @internal
 */
export const ROUTE_DEFINITIONS_SYMBOL = Symbol("router6.routeDefinitions");

/**
 * Internal Symbol for storing resolved forwardTo chains cache.
 * Maps route names to their final destination after following the entire chain.
 *
 * @internal
 * @todo RFC-8: This is a stopgap solution until CacheManager is implemented.
 *       Once CacheManager is available, migrate to:
 *       CacheManager.getInstance().setResolvedForwardMap(router, resolvedMap)
 *
 * **Current approach (temporary)**:
 * ```typescript
 * router[RESOLVED_FORWARD_MAP_SYMBOL] = { "A": "C", "B": "C" };
 * ```
 *
 * **Future approach (RFC-8)**:
 * ```typescript
 * CacheManager.getInstance().setResolvedForwardMap(router, resolvedMap);
 * ```
 *
 * See: .claude/issues/1-dx-improve-rfc-list/rfc-7-route-guard-check.md
 * See: .claude/issues/2-fsm-migration-rfc-list/rfc-8-cache-manager.md
 */
export const RESOLVED_FORWARD_MAP_SYMBOL = Symbol("router6.resolvedForwardMap");

/**
 * Internal Symbol for storing root path.
 *
 * @internal
 */
export const ROOT_PATH_SYMBOL = Symbol("router6.rootPath");

/**
 * Internal Symbol for storing router configuration.
 * Hides config from public API to prevent bypassing validation in updateRoute().
 *
 * @internal
 */
export const CONFIG_SYMBOL = Symbol("router6.config");

/**
 * @deprecated Use ROOT_TREE_SYMBOL instead
 * @internal
 */
export const ROOT_NODE_SYMBOL = ROOT_TREE_SYMBOL;

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
});

/**
 * General router constants.
 * Special route names and identifiers.
 */
export const constants: Constants = {
  UNKNOWN_ROUTE: "@@router6/UNKNOWN_ROUTE", // Special route for 404/not found states
};

/**
 * Plugin method names.
 * Maps to methods that plugins can implement to hook into router lifecycle.
 */
export const plugins: EventToPluginMap = {
  ROUTER_START: "onStart", // Plugin method called when router starts
  ROUTER_STOP: "onStop", // Plugin method called when router stops
  TRANSITION_START: "onTransitionStart", // Plugin method called when navigation begins
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
  TRANSITION_CANCEL: "$$cancel", // Emitted when navigation is cancelled
  TRANSITION_SUCCESS: "$$success", // Emitted when navigation completes successfully
  TRANSITION_ERROR: "$$error", // Emitted when navigation fails
};
