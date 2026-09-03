// packages/core/src/constants.ts

import type {
  EventToNameMap,
  EventToPluginMap,
  ErrorCodeToValueMap,
  ErrorCodeKeys,
  ErrorCodeValues,
  TransitionMeta,
} from "./types";

export type ConstantsKeys = "UNKNOWN_ROUTE";

export type Constants = Readonly<Record<ConstantsKeys, string>>;

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
  REENTRANT_NAVIGATION: "REENTRANT_NAVIGATION", // navigate() called synchronously from inside a transition-event listener (banned — use await/async listener)
  REENTRANT_TREE_MUTATION: "REENTRANT_TREE_MUTATION", // a tree mutator — route-CRUD or setRootPath (#1751) — called synchronously from inside a subscribeChanges handler (banned — use await/async/queueMicrotask)
  ROUTER_NOT_STOPPED: "NOT_STOPPED", // clear() called while a state is committed — tear down with stop() first, or swap the tree with replace() (#1612)
  WRONG_CHANNEL: "WRONG_CHANNEL", // a declared query key was supplied in the path channel (`params`) instead of `search` (#1572)
});

/**
 * General router constants.
 * Special route names and identifiers.
 */
export const UNKNOWN_ROUTE = "@@router/UNKNOWN_ROUTE";

/**
 * The one key the router will not copy into a state channel (#1792), and — at
 * `getDependenciesApi.getAll` — will not hand back out of a container either.
 *
 * `__proto__` is the only ACCESSOR among `Object.prototype`'s twelve own
 * members, so `target[key] = value` for that one name reaches the inherited
 * setter: no own key is created, the value vanishes with no error and no log,
 * and an OBJECT value replaces the target's prototype instead.
 *
 * ⚠ Core REFUSES it nowhere — not at a door, not at registration. It is dropped
 * where core copies into a CHANNEL and kept everywhere else, because a route's
 * custom fields and a plugin's context namespace are not containers a consumer
 * merges.
 *
 * ⚠ A `grep` for this constant does not find the sites carrying the opposite
 * contract: they go through `putField` (#1852), which keeps every name.
 *
 * The rule this serves, the doors exempt from it and the level it closes are
 * `INVARIANTS.md` — *Supported input shapes*, *WRITE* (#1852) and *HAND-OUT*
 * (#1957), with `handed-out-containers-1957.test.ts` as the authority. They are
 * deliberately not restated here: this docblock carried a second copy of that
 * section, and the two had already diverged.
 */
export const UNSAFE_KEY = "__proto__";

export const constants: Constants = Object.freeze({
  UNKNOWN_ROUTE,
});

/**
 * Plugin method names.
 * Maps to methods that plugins can implement to hook into router lifecycle.
 */
export const plugins: EventToPluginMap = Object.freeze({
  ROUTER_START: "onStart", // Plugin method called when router starts
  ROUTER_STOP: "onStop", // Plugin method called when router stops
  TRANSITION_START: "onTransitionStart", // Plugin method called when navigation begins
  TRANSITION_LEAVE_APPROVE: "onTransitionLeaveApprove", // Plugin method called when deactivation guards pass
  TRANSITION_CANCEL: "onTransitionCancel", // Plugin method called when navigation cancelled
  TRANSITION_SUCCESS: "onTransitionSuccess", // Plugin method called when navigation succeeds
  TRANSITION_ERROR: "onTransitionError", // Plugin method called when navigation fails
});

/**
 * Event names for router event system.
 * Used with addEventListener/removeEventListener for reactive subscriptions.
 */
export const events: EventToNameMap = Object.freeze({
  ROUTER_START: "$start", // Emitted when router.start() succeeds
  ROUTER_STOP: "$stop", // Emitted when router.stop() is called
  TRANSITION_START: "$$start", // Emitted when navigation begins
  TRANSITION_LEAVE_APPROVE: "$$leaveApprove", // Emitted when deactivation guards pass
  TRANSITION_CANCEL: "$$cancel", // Emitted when navigation is cancelled
  TRANSITION_SUCCESS: "$$success", // Emitted when navigation completes successfully
  TRANSITION_ERROR: "$$error", // Emitted when navigation fails
});

export const DEFAULT_LIMITS = Object.freeze({
  maxDependencies: 100,
  maxPlugins: 50,
  maxListeners: 10_000,
  warnListeners: 1000,
  maxLifecycleHandlers: 200,
} as const);

export const EMPTY_PARAMS: Readonly<Record<string, never>> = Object.freeze({});

/**
 * Shared frozen empty query bag reused for `State.search` when a navigation
 * carries no query params — the search-channel twin of {@link EMPTY_PARAMS}
 * (RFC-4 M2 / #1548). Lets `makeState` reuse one frozen `{}` (zero transient
 * allocation, #1027) instead of minting an object per query-less state.
 */
export const EMPTY_SEARCH: Readonly<Record<string, never>> = Object.freeze({});

/**
 * Shared frozen empty `NavigationOptions`, substituted by the facade when a
 * caller passes none — the options-channel twin of {@link EMPTY_PARAMS}.
 *
 * ⚑ It lives here rather than in `Router.ts` so the entry door can recognise it
 * by IDENTITY (#1962). `navigate("b")` is the commonest call in the library, and
 * matching this singleton is what keeps the door's cost on it to one comparison
 * instead of a copy nobody asked for.
 */
export const EMPTY_OPTS: Readonly<Record<string, never>> = Object.freeze({});

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
