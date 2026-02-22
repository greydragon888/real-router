// packages/core/src/index.ts

// Router-dependent types (defined in core)
export type {
  ActivationFnFactory,
  BuildStateResultWithSegments,
  GuardFnFactory,
  PluginFactory,
  Route,
  RouteConfigUpdate,
} from "./types";

// Router class (replaces Router interface from core-types)
export { Router } from "./Router";

// Types (re-exported from core-types - no Router dependency)
export type {
  ActivationFn,
  Config,
  DefaultDependencies,
  GuardFn,
  Listener,
  Navigator,
  NavigationOptions,
  Options,
  Params,
  Plugin,
  SimpleState,
  State,
  StateMeta,
  SubscribeFn,
  SubscribeState,
  Subscription,
  Unsubscribe,
} from "@real-router/types";

export type { ErrorCodes, Constants } from "./constants";

export { events, constants, errorCodes } from "./constants";

// RouterError class (migrated from router-error package)
export { RouterError } from "./RouterError";

export { createRouter } from "./createRouter";

export { getNavigator } from "./getNavigator";
