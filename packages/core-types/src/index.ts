// packages/core-types/modules/index.ts

// Route node types
export type {
  QueryParamsMode,
  QueryParamsOptions,
  RouteTreeState,
} from "./route-node-types";

// Base types
export type {
  Params,
  State,
  StateMeta,
  StateMetaInput,
  SimpleState,
  NavigationOptions,
  DoneFn,
  Unsubscribe,
  CancelFn,
  RouterError,
} from "./base";

// Router types
export type {
  BuildStateResultWithSegments,
  Route,
  Options,
  ActivationFn,
  ActivationFnFactory,
  DefaultDependencies,
  Config,
  Router,
  Plugin,
  Middleware,
  MiddlewareFactory,
  PluginFactory,
  SubscribeState,
  SubscribeFn,
  Listener,
  Subscription,
  RouteConfigUpdate,
} from "./router";

export type {
  PluginMethod,
  EventName,
  EventsKeys,
  ErrorCodeValues,
  ErrorCodeKeys,
  EventToPluginMap,
  EventToNameMap,
  ErrorCodeToValueMap,
} from "./constants";

// Note: RouterError type is a forward declaration matching the class in real-router package
// Use import { RouterError } from "real-router" for the actual class implementation
