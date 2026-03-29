// packages/core/src/namespaces/RouterLifecycleNamespace/types.ts

import type {
  NavigationOptions,
  Options,
  Params,
  State,
} from "@real-router/types";

export interface RouterLifecycleDependencies {
  getOptions: () => Options;
  navigate: (
    name: string,
    params: Params,
    opts: NavigationOptions,
  ) => Promise<State>;
  navigateToNotFound: (path: string) => State;
  clearState: () => void;
  matchPath: <P extends Params = Params>(path: string) => State<P> | undefined;
  completeStart: () => void;
  emitTransitionError: (
    toState: State | undefined,
    fromState: State | undefined,
    error: Error,
  ) => void;
}
