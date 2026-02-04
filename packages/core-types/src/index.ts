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

// Router types (base types without Router dependency)
// Note: Route, RouteConfigUpdate, ActivationFnFactory, MiddlewareFactory,
// PluginFactory, BuildStateResultWithSegments are in @real-router/core
export type {
  Options,
  ActivationFn,
  DefaultDependencies,
  Config,
  Plugin,
  Middleware,
  SubscribeState,
  SubscribeFn,
  Listener,
  Subscription,
  Navigator,
} from "./router";

// Limits configuration
export type { LimitsConfig } from "./limits";

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
