// packages/core/src/wiring/types.ts

import type {
  DependenciesNamespace,
  EventBusNamespace,
  NavigationNamespace,
  OptionsNamespace,
  PluginsNamespace,
  RouteLifecycleNamespace,
  RouterLifecycleNamespace,
  RoutesNamespace,
  StateNamespace,
} from "../namespaces";
import type { Router } from "../Router";
import type { Limits } from "../types";
import type { DefaultDependencies } from "@real-router/types";

/**
 * Constructor options bag for RouterWiringBuilder.
 *
 * Contains all namespaces, FSM, emitter, and accessors needed to wire
 * inter-namespace dependencies.
 */
export interface WiringOptions<Dependencies extends DefaultDependencies> {
  /** Router instance — passed to namespaces for factory initialization */
  router: Router<Dependencies>;
  /** Options namespace */
  options: OptionsNamespace;
  /** Immutable limits configuration */
  limits: Limits;
  /** Dependencies namespace */
  dependencies: DependenciesNamespace<Dependencies>;
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
