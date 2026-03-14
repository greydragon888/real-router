// packages/core/src/namespaces/NavigationNamespace/types.ts

import type {
  GuardFn,
  NavigationOptions,
  Options,
  Params,
  State,
} from "@real-router/types";

/**
 * Dependencies injected into NavigationNamespace.
 *
 * These are function references from other namespaces/facade,
 * avoiding the need to pass the entire Router object.
 **/
export interface NavigationDependencies {
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
  ) => State | undefined;

  /** Check if states are equal */
  areStatesEqual: (
    state1: State | undefined,
    state2: State | undefined,
    ignoreQueryParams?: boolean,
  ) => boolean;

  /** Resolve defaultRoute and defaultParams options (static value or callback) */
  resolveDefault: () => { route: string; params: Params };

  /** Start transition and send NAVIGATE event to routerFSM */
  startTransition: (toState: State, fromState: State | undefined) => void;

  /** Cancel navigation if transition is running */
  cancelNavigation: () => void;

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
}
