// packages/core/src/namespaces/NavigationNamespace/types.ts

import type {
  GuardFn,
  NavigationOptions,
  Options,
  Params,
  RouterLogger,
  SearchParams,
  State,
} from "../../types";

export interface NavigationContext {
  toState: State;
  fromState: State | undefined;
  opts: NavigationOptions;
  toDeactivate: string[];
  toActivate: string[];
  intersection: string;
  canDeactivateFunctions: Map<string, GuardFn>;
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
  getOptions: () => Options;

  /** Check if route exists */
  hasRoute: (name: string) => boolean;

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

  /** Resolve defaultRoute and defaultParams options (static value or callback) */
  resolveDefault: () => { route: string; params: Params };

  /** Start transition and send NAVIGATE event to routerFSM */
  startTransition: (toState: State, fromState: State | undefined) => void;

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

  /** Send FAIL event to routerFSM */
  sendTransitionFail: (
    toState: State,
    fromState: State | undefined,
    error: unknown,
  ) => void;

  /** Emit TRANSITION_ERROR event to listeners */
  emitTransitionError: (
    toState: State | undefined,
    fromState: State | undefined,
    error: unknown,
  ) => void;

  /** Emit TRANSITION_SUCCESS event to listeners (without FSM transition) */
  emitTransitionSuccess: (
    toState: State,
    fromState?: State,
    opts?: NavigationOptions,
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
