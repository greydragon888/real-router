// packages/core/src/namespaces/RouterLifecycleNamespace/types.ts

import type {
  NavigationOptions,
  Options,
  Params,
  State,
} from "@real-router/types";

export interface RouterLifecycleDependencies {
  getOptions: () => Options;
  makeNotFoundState: (path: string, options: NavigationOptions) => State;
  clearState: () => void;
  matchPath: <P extends Params = Params, MP extends Params = Params>(
    path: string,
  ) => State<P, MP> | undefined;
  completeStart: () => void;
  emitTransitionError: (
    toState: State | undefined,
    fromState: State | undefined,
    error: Error,
  ) => void;
}
