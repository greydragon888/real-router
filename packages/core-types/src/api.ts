// packages/core-types/modules/api.ts

/**
 * API interfaces for modular router access.
 * These interfaces are implemented by standalone API functions in @real-router/core.
 */

import type {
  Params,
  State,
  SimpleState,
  StateMetaInput,
  NavigationOptions,
  Unsubscribe,
} from "./base";
import type { EventMethodMap, EventName } from "./constants";
import type { RouteTreeState } from "./route-node-types";
import type {
  DefaultDependencies,
  GuardFnFactory,
  Options,
  Plugin,
  Route,
  RouteConfigUpdate,
} from "./router";

/**
 * Maps interceptable method names to their signatures.
 * Used by {@link PluginApi.addInterceptor} to provide type-safe interceptor registration.
 *
 * To add a new interceptable method:
 * 1. Add its signature here
 * 2. Wrap it with `createInterceptable()` in `RouterWiringBuilder`
 */
export interface InterceptableMethodMap {
  start: (path?: string) => Promise<State>;
  buildPath: (route: string, params?: Params) => string;
  forwardState: (routeName: string, routeParams: Params) => SimpleState;
}

/**
 * Type-safe interceptor callback.
 * Receives `next` (the next function in the chain) followed by the method's original parameters.
 */
export type InterceptorFn<M extends keyof InterceptableMethodMap> = (
  next: InterceptableMethodMap[M],
  ...args: Parameters<InterceptableMethodMap[M]>
) => ReturnType<InterceptableMethodMap[M]>;

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

  getTree: () => unknown;

  addInterceptor: <M extends keyof InterceptableMethodMap>(
    method: M,
    fn: InterceptorFn<M>,
  ) => Unsubscribe;
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

  replace: (routes: Route<Dependencies>[] | Route<Dependencies>) => void;

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
