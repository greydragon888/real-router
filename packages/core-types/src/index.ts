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

// Router types, factory types, and route config types
export type {
  Router,
  Navigator,
  Route,
  Plugin,
  Listener,
  Options,
  DefaultRouteCallback,
  ForwardToCallback,
  DefaultParamsCallback,
  ActivationFn,
  GuardFn,
  DefaultDependencies,
  Config,
  SubscribeState,
  SubscribeFn,
  Subscription,
  PluginFactory,
  GuardFnFactory,
  ActivationFnFactory,
  RouteConfigUpdate,
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
  EventMethodMap,
} from "./constants";

// API interfaces (modular router access)
export type {
  PluginApi,
  RoutesApi,
  DependenciesApi,
  LifecycleApi,
} from "./api";

// Note: RouterError type is a forward declaration matching the class in real-router package
// Use import { RouterError } from "real-router" for the actual class implementation
