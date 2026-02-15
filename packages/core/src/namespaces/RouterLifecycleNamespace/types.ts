// packages/core/src/namespaces/RouterLifecycleNamespace/types.ts

import type {
  EventsKeys,
  EventToNameMap,
  NavigationOptions,
  Options,
  Params,
  RouterError as RouterErrorType,
  State,
} from "@real-router/types";

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

  /** Make not found state */
  makeNotFoundState: (path: string, options: NavigationOptions) => State;

  /** Set router state (undefined to clear) */
  setState: (state?: State) => void;

  /** Match path to state (source param not needed for lifecycle) */
  matchPath: <P extends Params = Params, MP extends Params = Params>(
    path: string,
  ) => State<P, MP> | undefined;
}
