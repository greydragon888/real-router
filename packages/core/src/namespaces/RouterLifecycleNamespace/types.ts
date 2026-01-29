// packages/core/src/namespaces/RouterLifecycleNamespace/types.ts

import type {
  DoneFn,
  EventsKeys,
  EventToNameMap,
  NavigationOptions,
  Options,
  Params,
  RouterError as RouterErrorType,
  RouteTreeState,
  State,
  StateMetaInput,
} from "@real-router/types";

export type StartRouterArguments =
  | []
  | [done: DoneFn]
  | [startPathOrState: string | State]
  | [startPathOrState: string | State, done: DoneFn];

/**
 * Dependencies injected into RouterLifecycleNamespace.
 *
 * These are function references from other namespaces/facade,
 * avoiding the need to pass the entire Router object.
 */
export interface RouterLifecycleDependencies {
  /** Get router options */
  getOptions: () => Options;

  /** Check if event listeners exist for an event */
  hasListeners: (eventName: EventToNameMap[EventsKeys]) => boolean;

  /** Invoke event listeners */
  invokeEventListeners: (
    eventName: EventToNameMap[EventsKeys],
    toState?: State,
    fromState?: State,
    arg?: RouterErrorType | NavigationOptions,
  ) => void;

  /** Build state from route name and params */
  buildState: (
    routeName: string,
    routeParams: Params,
  ) => RouteTreeState | undefined;

  /** Make state object with path and meta */
  makeState: <P extends Params = Params, MP extends Params = Params>(
    name: string,
    params?: P,
    path?: string,
    meta?: StateMetaInput<MP>,
  ) => State<P, MP>;

  /** Build path from route name and params */
  buildPath: (route: string, params?: Params) => string;

  /** Make not found state */
  makeNotFoundState: (path: string, options: NavigationOptions) => State;

  /** Set router state (undefined to clear) */
  setState: (state?: State) => void;

  /** Match path to state (source param not needed for lifecycle) */
  matchPath: <P extends Params = Params, MP extends Params = Params>(
    path: string,
  ) => State<P, MP> | undefined;
}
