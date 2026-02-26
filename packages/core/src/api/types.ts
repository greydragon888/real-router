// IMPORTANT: Use the EXACT types from Router.ts method signatures

import type {
  EventMethodMap,
  GuardFnFactory,
  Route,
  RouteConfigUpdate,
} from "../types";
import type {
  DefaultDependencies,
  EventName,
  NavigationOptions,
  Options,
  Params,
  Plugin,
  RouteTreeState,
  SimpleState,
  State,
  StateMetaInput,
  Unsubscribe,
} from "@real-router/types";
import type { RouteTree } from "route-tree";

/**
 * Plugin API — for plugins and infrastructure packages.
 * Hides plugin-internal methods from public autocomplete.
 */
export interface PluginApi {
  makeState: <P extends Params = Params, MP extends Params = Params>(
    name: string,
    params?: P,
    path?: string,
    meta?: StateMetaInput<MP>,
    forceId?: number,
  ) => State<P, MP>;

  buildState: (
    routeName: string,
    routeParams: Params,
  ) => RouteTreeState | undefined;

  forwardState: <P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ) => SimpleState<P>;

  matchPath: <P extends Params = Params, MP extends Params = Params>(
    path: string,
  ) => State<P, MP> | undefined;

  setRootPath: (rootPath: string) => void;
  getRootPath: () => string;

  navigateToState: (
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
  ) => Promise<State>;

  addEventListener: <E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ) => Unsubscribe;

  buildNavigationState: (name: string, params?: Params) => State | undefined;

  getOptions: () => Options;

  getTree: () => RouteTree;

  getForwardState: () => <P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ) => SimpleState<P>;

  setForwardState: (
    fn: <P extends Params = Params>(
      routeName: string,
      routeParams: P,
    ) => SimpleState<P>,
  ) => void;
}

/**
 * Routes API — for dynamic route mutation.
 */
export interface RoutesApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  add: (
    routes: Route<Dependencies>[] | Route<Dependencies>,
    options?: { parent?: string },
  ) => void;

  remove: (name: string) => void;

  update: (name: string, updates: RouteConfigUpdate<Dependencies>) => void;

  clear: () => void;

  has: (name: string) => boolean;

  get: (name: string) => Route<Dependencies> | undefined;

  getConfig: (name: string) => Record<string, unknown> | undefined;
}

/**
 * Dependencies API — CRUD for dependency injection.
 */
export interface DependenciesApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  get: <K extends keyof Dependencies>(key: K) => Dependencies[K];
  getAll: () => Partial<Dependencies>;
  set: <K extends keyof Dependencies & string>(
    name: K,
    value: Dependencies[K],
  ) => void;
  setAll: (deps: Dependencies) => void;
  remove: (name: keyof Dependencies) => void;
  reset: () => void;
  has: (name: keyof Dependencies) => boolean;
}

/**
 * Lifecycle API — guard registration (addActivateGuard, addDeactivateGuard, etc.)
 */
export interface LifecycleApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  addActivateGuard: (
    name: string,
    canActivateHandler: GuardFnFactory<Dependencies> | boolean,
  ) => void;
  addDeactivateGuard: (
    name: string,
    canDeactivateHandler: GuardFnFactory<Dependencies> | boolean,
  ) => void;
  removeActivateGuard: (name: string) => void;
  removeDeactivateGuard: (name: string) => void;
}
