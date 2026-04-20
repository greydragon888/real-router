// packages/core-types/modules/api.ts

/**
 * API interfaces for modular router access.
 * These interfaces are implemented by standalone API functions in @real-router/core.
 */

import type {
  Params,
  State,
  SimpleState,
  StateContext,
  StateMetaInput,
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
  add: (routes: Route[], options?: { parent?: string }) => void;
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
 * Writer object returned by {@link PluginApi.claimContextNamespace}. Holds
 * exclusive ownership of a single `state.context.<namespace>` key for the
 * lifetime of the owning plugin.
 *
 * @description
 * A plugin obtains a claim by calling `api.claimContextNamespace("ns")` at
 * registration, then publishes per-navigation data via {@link write} from a
 * lifecycle hook (typically `onTransitionSuccess`) or from an interceptor.
 * The plugin must call {@link release} in its `teardown()` so another plugin
 * can reclaim the same namespace.
 *
 * The core runtime enforces one invariant: a namespace can be held by at most
 * one claim at a time. Double-claiming throws `CONTEXT_NAMESPACE_ALREADY_CLAIMED`.
 *
 * @example
 * ```typescript
 * const navigationPlugin: PluginFactory = (router) => {
 *   const api = getPluginApi(router);
 *   const claim = api.claimContextNamespace("navigation");
 *
 *   return {
 *     onTransitionSuccess(toState, fromState) {
 *       claim.write(toState, { direction: detectDirection(fromState, toState) });
 *     },
 *     teardown() {
 *       claim.release();
 *     },
 *   };
 * };
 * ```
 *
 * @see {@link PluginApi.claimContextNamespace}
 * @see {@link State.context}
 */
export interface ContextNamespaceClaim<T = unknown> {
  write: (state: State, value: T) => void;
  release: () => void;
}

/**
 * Plugin API — for plugins and infrastructure packages.
 * Hides plugin-internal methods from public autocomplete.
 */
export interface PluginApi {
  makeState: <P extends Params = Params>(
    name: string,
    params?: P,
    path?: string,
    meta?: StateMetaInput,
  ) => State<P>;

  buildState: (
    routeName: string,
    routeParams: Params,
  ) => RouteTreeState | undefined;

  forwardState: <P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ) => SimpleState<P>;

  matchPath: <P extends Params = Params>(path: string) => State<P> | undefined;

  setRootPath: (rootPath: string) => void;
  getRootPath: () => string;

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

  extendRouter: (extensions: Record<string, unknown>) => Unsubscribe;

  /**
   * Emits a `$$error` event without going through the navigation pipeline.
   *
   * Used by plugins that detect an error outside a running transition (e.g.,
   * an unmatched URL on popstate in strict mode). The event reaches any
   * `onTransitionError` plugin hook and any `$$error` listener so developers
   * can observe errors raised by the plugin layer.
   *
   * The current router state is used as `fromState`; `toState` is `undefined`
   * because no transition was attempted. Safe to call at any FSM state —
   * delegates to `sendFailSafe` internally (direct emit when not READY).
   */
  emitTransitionError: (error: Error) => void;

  claimContextNamespace: {
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- StateContext is an empty interface extended via module augmentation, so `keyof StateContext & string` is `never` at baseline and resolves to the augmented keys when plugins extend it
    <K extends keyof StateContext & string>(
      namespace: K,
    ): ContextNamespaceClaim<StateContext[K]>;
    (namespace: string): ContextNamespaceClaim;
  };

  getRouteConfig: (name: string) => Record<string, unknown> | undefined;
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
