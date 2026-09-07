// packages/core/src/namespaces/index.ts

export {
  createDependenciesStore,
  storeDependency,
} from "./DependenciesNamespace";

export type { DependenciesStore } from "./DependenciesNamespace";

export { OptionsNamespace } from "./OptionsNamespace";

export { StateNamespace } from "./StateNamespace";

export { PluginsNamespace } from "./PluginsNamespace";

export { RouteLifecycleNamespace } from "./RouteLifecycleNamespace";

export { RoutesNamespace } from "./RoutesNamespace";

export type { RouteConfig } from "./RoutesNamespace";

export { NavigationNamespace } from "./NavigationNamespace";

export { RouterLifecycleNamespace } from "./RouterLifecycleNamespace";

export { EventBusNamespace } from "./EventBusNamespace";
