// packages/core/src/namespaces/NavigationNamespace/types.ts

import type { BuildStateResultWithSegments } from "../../types";
import type {
  GuardFn,
  NavigationOptions,
  Options,
  Params,
  State,
  StateMetaInput,
  TransitionPhase,
} from "@real-router/types";

/**
 * Dependencies injected into NavigationNamespace.
 *
 * These are function references from other namespaces/facade,
 * avoiding the need to pass the entire Router object.
 */
export interface NavigationDependencies {
  /** Get router options */
  getOptions: () => Options;

  /** Check if route exists */
  hasRoute: (name: string) => boolean;

  /** Get current state */
  getState: () => State | undefined;

  /** Set router state */
  setState: (state?: State) => void;

  /** Build state with segments from route name and params */
  buildStateWithSegments: <P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ) => BuildStateResultWithSegments<P> | undefined;

  /** Make state object with path and meta */
  makeState: <P extends Params = Params, MP extends Params = Params>(
    name: string,
    params?: P,
    path?: string,
    meta?: StateMetaInput<MP>,
  ) => State<P, MP>;

  /** Build path from route name and params */
  buildPath: (route: string, params?: Params) => string;

  /** Check if states are equal */
  areStatesEqual: (
    state1: State | undefined,
    state2: State | undefined,
    ignoreQueryParams?: boolean,
  ) => boolean;

  /** Get a dependency by name (untyped — used only for resolveOption) */
  getDependency: (name: string) => unknown;

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

  /** Send FAIL event to routerFSM (transition blocked) */
  sendTransitionBlocked: (
    toState: State,
    fromState: State | undefined,
    error: unknown,
  ) => void;

  /** Send FAIL event to routerFSM (transition error) */
  sendTransitionError: (
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
}

export interface TransitionOutput {
  state: State;
  meta: {
    phase: TransitionPhase;
    segments: {
      deactivated: string[];
      activated: string[];
      intersection: string;
    };
  };
}

/**
 * Dependencies required for the transition function.
 */
export interface TransitionDependencies {
  /** Get lifecycle functions (canDeactivate, canActivate maps) */
  getLifecycleFunctions: () => [Map<string, GuardFn>, Map<string, GuardFn>];

  /** Check if router is active (for cancellation check on stop()) */
  isActive: () => boolean;

  /** Check if a transition is currently in progress */
  isTransitioning: () => boolean;

  /** Clear canDeactivate guard for a route */
  clearCanDeactivate: (name: string) => void;
}
