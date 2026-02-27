// packages/core/src/namespaces/index.ts

export { createDependenciesStore } from "./DependenciesNamespace";

export type { DependenciesStore } from "./DependenciesNamespace";

export {
  deepFreeze,
  defaultOptions,
  OptionsNamespace,
  VALID_OPTION_VALUES,
  VALID_QUERY_PARAMS,
} from "./OptionsNamespace";

export { StateNamespace } from "./StateNamespace";

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

export { EventBusNamespace } from "./EventBusNamespace";
