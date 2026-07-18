// packages/core/src/wiring/types.ts

import type {
  EventBusNamespace,
  NavigationNamespace,
  OptionsNamespace,
  PluginsNamespace,
  RouteLifecycleNamespace,
  RouterLifecycleNamespace,
  RoutesNamespace,
  StateNamespace,
} from "../namespaces";
import type { DependenciesStore } from "../namespaces/DependenciesNamespace/dependenciesStore";
import type { DefaultDependencies } from "../public-types";
import type { Router } from "../Router";
import type { Limits } from "../types";

/**
 * Shared bag of namespaces + accessors passed to {@link wireNamespaces} and its
 * `wire*` functions — the sole input to wiring. One interface, referenced by
 * every wire function, instead of a field list repeated across a builder class.
 */
export interface NamespaceBag<Dependencies extends DefaultDependencies> {
  /** Router instance — passed to namespaces for factory initialization */
  router: Router<Dependencies>;
  /** Options namespace */
  options: OptionsNamespace;
  /** Immutable limits configuration */
  limits: Limits;
  /** Dependencies store */
  dependenciesStore: DependenciesStore<Dependencies>;
  /** State namespace */
  state: StateNamespace;
  /** Routes namespace */
  routes: RoutesNamespace<Dependencies>;
  /** Route lifecycle namespace (canActivate/canDeactivate guards) */
  routeLifecycle: RouteLifecycleNamespace<Dependencies>;
  /** Plugins namespace */
  plugins: PluginsNamespace<Dependencies>;
  /** Navigation namespace */
  navigation: NavigationNamespace;
  /** Router lifecycle namespace (start/stop) */
  lifecycle: RouterLifecycleNamespace;
  /** EventBus namespace — unified FSM + EventEmitter abstraction */
  eventBus: EventBusNamespace;
}
