// packages/core-types/modules/index.ts

// Route node types
export type {
  QueryParamsMode,
  QueryParamsOptions,
  RouteParams,
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
  Unsubscribe,
  RouterError,
  TransitionPhase,
  TransitionReason,
  TransitionMeta,
} from "./base";

// Router types (base types without Router dependency)
// Note: Route, RouteConfigUpdate, ActivationFnFactory, MiddlewareFactory,
// PluginFactory, BuildStateResultWithSegments are in @real-router/core
export type {
  Options,
  DefaultRouteCallback,
  ForwardToCallback,
  DefaultParamsCallback,
  ActivationFn,
  GuardFn,
  MiddlewareFn,
  DefaultDependencies,
  Config,
  Plugin,
  Middleware,
  SubscribeState,
  SubscribeFn,
  Listener,
  Subscription,
  Navigator,
  Router,
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
