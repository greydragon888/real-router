// packages/core/src/namespaces/index.ts

export {
  DependenciesNamespace,
  DEPENDENCY_LIMITS,
} from "./DependenciesNamespace";

export {
  invokeFor,
  MAX_EVENT_DEPTH,
  MAX_LISTENERS_HARD_LIMIT,
  ObservableNamespace,
  validEventNames,
} from "./ObservableNamespace";

export type { EventMethodMap } from "./ObservableNamespace";

export {
  deepFreeze,
  defaultOptions,
  optionNotFoundError,
  OptionsNamespace,
  UNLOCKED_OPTIONS,
  VALID_OPTION_VALUES,
  VALID_QUERY_PARAMS,
} from "./OptionsNamespace";

export { StateNamespace } from "./StateNamespace";

export { MiddlewareNamespace, MIDDLEWARE_LIMITS } from "./MiddlewareNamespace";

export {
  PluginsNamespace,
  PLUGIN_LIMITS,
  EVENTS_MAP,
  EVENT_METHOD_NAMES,
} from "./PluginsNamespace";

export {
  RouteLifecycleNamespace,
  LIFECYCLE_LIMITS,
} from "./RouteLifecycleNamespace";

export {
  RoutesNamespace,
  DEFAULT_ROUTE_NAME,
  validatedRouteNames,
  createEmptyConfig,
} from "./RoutesNamespace";

export type { RouteConfig } from "./RoutesNamespace";

export { NavigationNamespace } from "./NavigationNamespace";

export { RouterLifecycleNamespace } from "./RouterLifecycleNamespace";

export { CloneNamespace } from "./CloneNamespace";

export type { ApplyConfigFn, CloneData, RouterFactory } from "./CloneNamespace";
