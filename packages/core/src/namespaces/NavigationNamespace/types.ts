// packages/core/src/namespaces/NavigationNamespace/types.ts

import type {
  GuardFn,
  NavigationOptions,
  AnyOptions,
  Params,
  RouterLogger,
  SearchParams,
  State,
} from "../../types";

export interface NavigationContext {
  /**
   * Supersession token — `#navigationId` at the moment this navigation began.
   * Lives HERE and not on {@link NavigationPlan} because `completeTransition`
   * needs it to tell "the machine is still in MY transition" from "…in somebody
   * else's" (#1626), and it is handed a `NavigationContext`. Purely a type-level
   * move: no `NavigationContext` is ever built independently of a plan.
   */
  myId: number;
  /**
   * The machine's epoch for THIS navigation, read right after the NAVIGATE
   * update ran. Stamped onto the FAILs this navigation sends, so a report from
   * one that has already been superseded is refused by the table
   * (`when: mayFail`) instead of moving the machine out from under the live one.
   */
  myEpoch: number;
  toState: State;
  fromState: State | undefined;
  opts: NavigationOptions;
  toDeactivate: string[];
  toActivate: string[];
  intersection: string;
  canDeactivateFunctions: Map<string, GuardFn>;
}

/**
 * Everything a navigation works out BEFORE any guard runs, in one bag.
 *
 * A superset of {@link NavigationContext}, so the same object is handed to
 * `completeTransition` / `#finishAsyncNavigation` at the end instead of a second
 * literal being built there — the allocation count per navigation is unchanged
 * (one), which is why this is a refactor and not a hot-path regression.
 *
 * Filled in two passes across the FSM's `TRANSITION_START` emit, because the
 * order is observable: `suspendable` must be read BEFORE the pre-commit listener
 * windows (#1169 — a listener's `stop()` empties the listener lists), while the
 * guard maps must be read AFTER, since a `TRANSITION_START` listener may still
 * register a guard. The fields of the second pass therefore start as write-once
 * placeholders.
 */
export interface NavigationPlan extends NavigationContext {
  /** Whether a synchronous supersede is reachable at all (#1169 commit-gate). */
  suspendable: boolean;
  canActivateFunctions: Map<string, GuardFn>;
  shouldDeactivate: boolean;
  shouldActivate: boolean;
  hasGuards: boolean;
}

/**
 * Dependencies injected into NavigationNamespace.
 *
 * These are function references from other namespaces/facade,
 * avoiding the need to pass the entire Router object.
 */
export interface NavigationDependencies {
  /** Per-router logger instance (from `getInternals(router).logger`) */
  logger: RouterLogger;

  /** Get router options */
  // The erased view: these namespaces READ configuration (`defaultRoute`
  // truthiness, `allowNotFound`) — they never resolve a callback, which is
  // `resolveDefault`'s job. Taking `AnyOptions` keeps the dependency-map
  // generic out of every namespace that has no use for it.
  getOptions: () => AnyOptions;

  /** Check if route exists */
  hasRoute: (name: string) => boolean;

  /**
   * The route's DECLARED query-param names — the same registry the URL build
   * prints from (#1556), minus path slots. Feeds the always-on channel guard
   * (#1572); read here rather than re-derived, so classification cannot drift.
   */
  getQueryParams: (name: string) => readonly string[];

  /**
   * Per-segment param-source map for a route name (`{ segment: { param: "url" |
   * "query" } }`), read from the live matcher — the ownership channel for
   * `getTransitionPath` (RFC-4 M2 / #1548, replaced the removed `stateMetaStore`
   * WeakMap). `undefined` when the name is not in the tree.
   */
  getMetaForState: (
    name: string,
  ) => Record<string, Record<string, "url" | "query">> | undefined;

  /** Get current state */
  getState: () => State | undefined;

  /** Set router state */
  setState: (state: State) => void;

  /** Build complete navigate state: forwardState + route check + buildPath + makeState in one step */
  buildNavigateState: (
    routeName: string,
    routeParams: Params,
    routeSearch?: SearchParams,
  ) => State | undefined;

  /**
   * Resolve the `defaultRoute` / `defaultParams` / `defaultSearch` options
   * (each a static value or a callback). Two channels, never one bag — the
   * default route may be chosen dynamically, so its query defaults have to
   * travel in their own slot rather than be re-channelled downstream
   * (RFC-4 M2 / #1548).
   */
  resolveDefault: () => { route: string; params: Params; search: SearchParams };

  /** Start transition and send NAVIGATE event to routerFSM */
  startTransition: (toState: State, fromState: State | undefined) => void;

  /** The machine's current navigation epoch — read right after `startTransition`. */
  getNavigationEpoch: () => number;

  /**
   * Commit a state that is NOT the product of a navigation, through the FSM
   * `SYSTEM_COMMIT` action (write + announce in one table fact). Throws
   * `ROUTER_DISPOSED` when the machine has no edge to take.
   */
  systemCommit: (
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
  ) => void;

  /**
   * Cancel the in-flight navigation via the FSM `CANCEL` event. The `CANCEL`
   * action aborts the current controller (with `reason`, if given — surfaces as
   * the leave signal's `reason`, #943) and emits `TRANSITION_CANCEL`. No-op when
   * nothing is cancellable.
   */
  cancelNavigation: (reason?: unknown) => void;

  /** Send COMPLETE event to routerFSM */
  sendTransitionDone: (
    state: State,
    fromState: State | undefined,
    opts: NavigationOptions,
  ) => void;

  /**
   * Send FAIL event to routerFSM, stamped with the sending navigation's epoch
   * so the table can refuse a report from one that has already been superseded.
   */
  sendTransitionFail: (
    toState: State,
    fromState: State | undefined,
    error: unknown,
    epoch: number,
  ) => void;

  /** Emit TRANSITION_ERROR event to listeners */
  emitTransitionError: (
    toState: State | undefined,
    fromState: State | undefined,
    error: unknown,
  ) => void;

  /** Send LEAVE_APPROVE event to routerFSM and emit to listeners */
  sendLeaveApprove: (toState: State, fromState: State | undefined) => void;

  /** Check if navigation can begin (router is started) */
  canNavigate: () => boolean;

  /** Get lifecycle functions (canDeactivate, canActivate maps) */
  getLifecycleFunctions: () => [Map<string, GuardFn>, Map<string, GuardFn>];

  /** Check if router is active (for cancellation check on stop()) */
  isActive: () => boolean;

  /** Check if a transition is currently in progress */
  isTransitioning: () => boolean;

  /** Clear canDeactivate guard for a route */
  clearCanDeactivate: (name: string) => void;

  /** Check if any leave listeners are registered */
  hasLeaveListeners: () => boolean;

  /** Any pre-commit transition listener (onTransitionStart / onTransitionLeaveApprove) — #1169 gate */
  hasPreCommitListeners: () => boolean;

  /** Call all leave listeners — returns Promise if any are async, undefined otherwise */
  awaitLeaveListeners: (
    toState: State,
    fromState: State | undefined,
    signal: AbortSignal,
  ) => Promise<void> | undefined;
}
