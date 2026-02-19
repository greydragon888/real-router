// packages/core/src/wiring/types.ts

import type { RouterEvent, RouterPayloads, RouterState } from "../fsm";
import type {
  CloneNamespace,
  DependenciesNamespace,
  MiddlewareNamespace,
  NavigationNamespace,
  OptionsNamespace,
  PluginsNamespace,
  RouteLifecycleNamespace,
  RouterLifecycleNamespace,
  RoutesNamespace,
  StateNamespace,
} from "../namespaces";
import type { Router } from "../Router";
import type { ActivationFnFactory, Limits, RouterEventMap } from "../types";
import type { FSM } from "@real-router/fsm";
import type {
  DefaultDependencies,
  Params,
  SimpleState,
  State,
} from "@real-router/types";
import type { EventEmitter } from "event-emitter";

export interface RouterFacade<Dependencies extends DefaultDependencies> {
  addActivateGuard: (
    name: string,
    handler: ActivationFnFactory<Dependencies> | boolean,
  ) => unknown;
  addDeactivateGuard: (
    name: string,
    handler: ActivationFnFactory<Dependencies> | boolean,
  ) => unknown;
  forwardState: <P extends Params>(
    routeName: string,
    routeParams: P,
  ) => SimpleState<P>;
  isActive: () => boolean;
}

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
  /** Middleware namespace */
  middleware: MiddlewareNamespace<Dependencies>;
  /** Plugins namespace */
  plugins: PluginsNamespace<Dependencies>;
  /** Navigation namespace */
  navigation: NavigationNamespace;
  /** Router lifecycle namespace (start/stop) */
  lifecycle: RouterLifecycleNamespace;
  /** Clone namespace (SSR cloning) */
  clone: CloneNamespace<Dependencies>;
  /** Router finite state machine */
  routerFSM: FSM<RouterState, RouterEvent, null, RouterPayloads>;
  /** Event emitter for router events */
  emitter: EventEmitter<RouterEventMap>;
  /** Get the current in-flight toState (replaces #currentToState private field) */
  getCurrentToState: () => State | undefined;
  /** Set the current in-flight toState (replaces #currentToState private field) */
  setCurrentToState: (state: State | undefined) => void;
}
