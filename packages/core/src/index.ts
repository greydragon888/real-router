// packages/core/src/index.ts

// Router-dependent types (re-exported from @real-router/types)

export type {
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

export { events, constants, errorCodes, UNKNOWN_ROUTE } from "./constants";

// RouterError class (migrated from router-error package)
export { RouterError } from "./RouterError";

export { createRouter } from "./createRouter";

export { getNavigator } from "./getNavigator";

export type { RouteTree } from "route-tree";
