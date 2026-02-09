// packages/core/src/namespaces/NavigationNamespace/types.ts

import type { BuildStateResultWithSegments } from "../../types";
import type {
  ActivationFn,
  DoneFn,
  EventsKeys,
  EventToNameMap,
  Middleware,
  NavigationOptions,
  Options,
  Params,
  RouterError as RouterErrorType,
  State,
  StateMetaInput,
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

  /** Invoke event listeners */
  invokeEventListeners: (
    eventName: EventToNameMap[EventsKeys],
    toState?: State,
    fromState?: State,
    arg?: RouterErrorType | NavigationOptions,
  ) => void;
}

/**
 * Dependencies required for the transition function.
 */
export interface TransitionDependencies {
  /** Get lifecycle functions (canDeactivate, canActivate maps) */
  getLifecycleFunctions: () => [
    Map<string, ActivationFn>,
    Map<string, ActivationFn>,
  ];

  /** Get middleware functions array */
  getMiddlewareFunctions: () => Middleware[];

  /** Check if router is active (for cancellation check) */
  isActive: () => boolean;

  /** Clear canDeactivate guard for a route */
  clearCanDeactivate: (name: string) => void;
}

/**
 * Result of parsing polymorphic navigate() arguments.
 */
export interface ParsedNavigateArgs {
  params: Params;
  opts: NavigationOptions;
  callback: DoneFn;
}

/**
 * Result of parsing polymorphic navigateToDefault() arguments.
 */
export interface ParsedNavigateDefaultArgs {
  opts: NavigationOptions;
  callback: DoneFn;
}
