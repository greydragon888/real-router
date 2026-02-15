// packages/core/src/namespaces/index.ts

export { DependenciesNamespace } from "./DependenciesNamespace";

export {
  invokeFor,
  ObservableNamespace,
  validEventNames,
} from "./ObservableNamespace";

export type { EventMethodMap } from "./ObservableNamespace";

export {
  deepFreeze,
  defaultOptions,
  OptionsNamespace,
  VALID_OPTION_VALUES,
  VALID_QUERY_PARAMS,
} from "./OptionsNamespace";

export { StateNamespace } from "./StateNamespace";

export { MiddlewareNamespace } from "./MiddlewareNamespace";

export {
  PluginsNamespace,
  EVENTS_MAP,
  EVENT_METHOD_NAMES,
} from "./PluginsNamespace";

export { RouteLifecycleNamespace } from "./RouteLifecycleNamespace";

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
