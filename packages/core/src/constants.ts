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
 * The one key the router will not copy into a state channel (#1792).
 *
 * ⚠ It does not REFUSE it — nothing throws, at any door or at registration; the
 * key is dropped where core copies. And this constant is not the only mention
 * of the name in the package: `claim.write` and the route-record merge match the
 * literal deliberately, to KEEP it (#1191 / #1788). Those are the opposite
 * contract, on purpose.
 *
 * `__proto__` is the only ACCESSOR among `Object.prototype`'s twelve own
 * members, so `target[key] = value` for that one name reaches the inherited
 * setter: no own key is created, the value vanishes with no error and no log,
 * and an OBJECT value replaces the target's prototype instead. Every idiom in
 * core that copies a foreign bag into an object core owns therefore has to name
 * it — plain assignment loses it, a spread re-creates it.
 *
 * ⚑ **What is guaranteed, precisely.** A bag that is ORDINARY — plain data that
 * does not change while the router is reading it — cannot put this key among the
 * OWN KEYS of `state.params` or `state.search`. The guarantee is one level deep,
 * and deliberately so: every copy here is `copy[key] = value`, so a value that is
 * itself an object is carried by REFERENCE. Put a bag inside a bag and the inner
 * one is still yours — unfrozen, and with whatever keys you gave it. That means
 * `Object.assign({}, state.search.inner)` can still swap a prototype and
 * `JSON.stringify(getState())` can still carry the name, one level down. Copying
 * deeper would put an unbounded walk on every commit, and the router does not
 * know which of your values are structures and which are opaque handles. That covers the case the rule exists for: a
 * bag from `JSON.parse`, from `history.state`, from a query string an app parsed
 * itself. Entry-point checks cannot deliver even that much, because they read a
 * bag the router does not own and the copy happens later.
 *
 * ⚑ **What is NOT guaranteed, deliberately.** Nothing about a bag that CHANGES
 * while the router reads it — an accessor that rewrites its own object, a Proxy
 * answering differently per trap call. A router cannot defend an application
 * against its own code, and pretending otherwise buys discipline at a dozen
 * sites for a case only the caller can create. That one belongs to whoever
 * handed the bag over, and it is written down rather than defended against.
 *
 * ⚠ The guards below are written WITHOUT reachability arguments: "it cannot get
 * here" is a claim about an object the router does not own, and two such claims
 * have already been wrong. OWNERSHIP is a sound reason to omit a guard;
 * reachability is not.
 *
 * ⚠ Two copies in core do NOT name it, and they are listed here rather than
 * left for the next audit to find. `channels/modeGate.ts` is exempt by
 * ownership — its sole caller hands it a bag core built. `channels/defaults.ts`
 * (`withholdFilledSlots`) is NOT: it copies a route's own `defaultSearch`, an
 * object the application still holds, and nothing downstream would notice
 * because the merge below it walks own keys. That is the reachability argument
 * this note calls insufficient, and it is recorded as an open exception rather
 * than as a justification.
 */
export const UNSAFE_KEY = "__proto__";

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
  maxLifecycleHandlers: 200,
} as const;

export const EMPTY_PARAMS: Readonly<Record<string, never>> = Object.freeze({});

/**
 * Shared frozen empty query bag reused for `State.search` when a navigation
 * carries no query params — the search-channel twin of {@link EMPTY_PARAMS}
 * (RFC-4 M2 / #1548). Lets `makeState` reuse one frozen `{}` (zero transient
 * allocation, #1027) instead of minting an object per query-less state.
 */
export const EMPTY_SEARCH: Readonly<Record<string, never>> = Object.freeze({});

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
