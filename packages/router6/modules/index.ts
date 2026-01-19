// packages/real-router/modules/index.ts

// Types (re-exported from real-router-types)
export type {
  ActivationFn,
  ActivationFnFactory,
  CancelFn,
  Config,
  DefaultDependencies,
  DoneFn,
  Listener,
  Middleware,
  MiddlewareFactory,
  NavigationOptions,
  Options,
  Params,
  Plugin,
  PluginFactory,
  Route,
  Router,
  SimpleState,
  State,
  StateMeta,
  SubscribeFn,
  SubscribeState,
  Subscription,
  Unsubscribe,
} from "router6-types";

export type { ErrorCodes, Constants } from "./constants";

export { events, constants, errorCodes } from "./constants";

// RouterError class (migrated from router-error package)
export { RouterError } from "./RouterError";

export { createRouter } from "./createRouter";
