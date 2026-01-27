// packages/core/src/Router.ts

/**
 * Router class - facade over legacy decorator-based router.
 *
 * This is Phase 1 of RFC-1 "Fort Knox" architecture.
 * Creates an explicit facade that delegates all operations
 * to the legacy router while maintaining a stable public API.
 *
 * In future phases, the legacy router will be replaced with
 * namespace classes for true encapsulation.
 */

import { logger } from "@real-router/logger";

import {
  CONFIG_SYMBOL,
  RESOLVED_FORWARD_MAP_SYMBOL,
  ROOT_PATH_SYMBOL,
  ROOT_TREE_SYMBOL,
  ROUTE_DEFINITIONS_SYMBOL,
} from "./constants";
import { withDependencies } from "./core/dependencies";
import { withMiddleware } from "./core/middleware";
import { withNavigation } from "./core/navigation";
import { withObservability } from "./core/observable";
import { withOptions } from "./core/options";
import { withPlugins } from "./core/plugins";
import { withRouteLifecycle } from "./core/routeLifecycle";
import { withRouterLifecycle } from "./core/routerLifecycle";
import { withRoutes } from "./core/routes";
import { withState } from "./core/state";
import { isLoggerConfig } from "./typeGuards";

import type {
  ActivationFn,
  ActivationFnFactory,
  BuildStateResultWithSegments,
  CancelFn,
  Config,
  DefaultDependencies,
  DoneFn,
  EventsKeys,
  EventToNameMap,
  Middleware,
  MiddlewareFactory,
  NavigationOptions,
  Options,
  Params,
  Plugin,
  PluginFactory,
  Route,
  RouteConfigUpdate,
  Router as RouterInterface,
  RouterError,
  RouteTreeState,
  State,
  StateMetaInput,
  SubscribeFn,
  Unsubscribe,
} from "@real-router/types";

/**
 * Symbol to access the underlying legacy router.
 * Used internally for debugging and testing.
 *
 * @internal
 */
export const LEGACY_ROUTER_SYMBOL = Symbol("real-router.legacyRouter");

type LegacyRouter<Dependencies extends DefaultDependencies> =
  RouterInterface<Dependencies>;

type Enhancer<Dependencies extends DefaultDependencies = DefaultDependencies> =
  (router: LegacyRouter<Dependencies>) => LegacyRouter<Dependencies>;

const pipe =
  <Dependencies extends DefaultDependencies = DefaultDependencies>(
    ...fns: Enhancer<Dependencies>[]
  ) =>
  (arg: LegacyRouter<Dependencies>): LegacyRouter<Dependencies> =>
    // eslint-disable-next-line unicorn/no-array-reduce
    fns.reduce((prev: LegacyRouter<Dependencies>, fn) => fn(prev), arg);

/**
 * Router class that wraps the legacy decorator-based router.
 *
 * Each public method explicitly delegates to the internal legacy router.
 * Methods that return Router return `this` to enable method chaining.
 *
 * @internal This class implementation is internal. Use createRouter() instead.
 */
export class Router<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> implements RouterInterface<Dependencies> {
  // Index signatures to satisfy interface
  [key: symbol]: unknown;
  [key: string]: unknown;

  /**
   * Internal symbol accessors - delegate to legacy router.
   * These are used by tests and internal code.
   *
   * @internal
   */
  /* eslint-disable @typescript-eslint/member-ordering -- getter/setter pairs must be adjacent */
  get [LEGACY_ROUTER_SYMBOL](): LegacyRouter<Dependencies> {
    return this.#legacyRouter;
  }

  get [CONFIG_SYMBOL](): Config {
    return this.#legacyRouter[CONFIG_SYMBOL] as Config;
  }

  set [CONFIG_SYMBOL](value: Config) {
    this.#legacyRouter[CONFIG_SYMBOL] = value;
  }

  get [ROOT_TREE_SYMBOL](): unknown {
    return this.#legacyRouter[ROOT_TREE_SYMBOL];
  }

  set [ROOT_TREE_SYMBOL](value: unknown) {
    this.#legacyRouter[ROOT_TREE_SYMBOL] = value;
  }

  get [ROUTE_DEFINITIONS_SYMBOL](): unknown {
    return this.#legacyRouter[ROUTE_DEFINITIONS_SYMBOL];
  }

  set [ROUTE_DEFINITIONS_SYMBOL](value: unknown) {
    this.#legacyRouter[ROUTE_DEFINITIONS_SYMBOL] = value;
  }

  get [ROOT_PATH_SYMBOL](): string {
    return this.#legacyRouter[ROOT_PATH_SYMBOL] as string;
  }

  set [ROOT_PATH_SYMBOL](value: string) {
    this.#legacyRouter[ROOT_PATH_SYMBOL] = value;
  }

  get [RESOLVED_FORWARD_MAP_SYMBOL](): unknown {
    return this.#legacyRouter[RESOLVED_FORWARD_MAP_SYMBOL];
  }

  set [RESOLVED_FORWARD_MAP_SYMBOL](value: unknown) {
    this.#legacyRouter[RESOLVED_FORWARD_MAP_SYMBOL] = value;
  }
  /* eslint-enable @typescript-eslint/member-ordering */

  readonly #legacyRouter: LegacyRouter<Dependencies>;

  /**
   * @param routes - Route definitions
   * @param options - Router options
   * @param dependencies - DI dependencies
   */
  constructor(
    routes: Route<Dependencies>[] = [],
    options: Partial<Options> = {},
    dependencies: Dependencies = {} as Dependencies,
  ) {
    if (options.logger && isLoggerConfig(options.logger)) {
      logger.configure(options.logger);
      delete options.logger;
    }

    const config: Config = {
      decoders: {},
      encoders: {},
      defaultParams: {},
      forwardMap: {},
    };

    const uninitializedRouter = {
      [CONFIG_SYMBOL]: config,
    };

    this.#legacyRouter = pipe<Dependencies>(
      withOptions(options),
      withDependencies(dependencies),
      withObservability,
      withState,
      withRouterLifecycle,
      withRouteLifecycle,
      withNavigation,
      withPlugins,
      withMiddleware,
      withRoutes(routes),
    )(uninitializedRouter as unknown as LegacyRouter<Dependencies>);
  }

  // ============================================================================
  // Route Management
  // ============================================================================

  addRoute(routes: Route<Dependencies>[] | Route<Dependencies>): this {
    this.#legacyRouter.addRoute(routes);

    return this;
  }

  removeRoute(name: string): this {
    this.#legacyRouter.removeRoute(name);

    return this;
  }

  clearRoutes(): this {
    this.#legacyRouter.clearRoutes();

    return this;
  }

  getRoute(name: string): Route<Dependencies> | undefined {
    return this.#legacyRouter.getRoute(name);
  }

  hasRoute(name: string): boolean {
    return this.#legacyRouter.hasRoute(name);
  }

  updateRoute(name: string, updates: RouteConfigUpdate<Dependencies>): this {
    this.#legacyRouter.updateRoute(name, updates);

    return this;
  }

  // ============================================================================
  // Path & State Building
  // ============================================================================

  isActiveRoute(
    name: string,
    params?: Params,
    strictEquality?: boolean,
    ignoreQueryParams?: boolean,
  ): boolean {
    return this.#legacyRouter.isActiveRoute(
      name,
      params,
      strictEquality,
      ignoreQueryParams,
    );
  }

  buildPath(route: string, params?: Params): string {
    return this.#legacyRouter.buildPath(route, params);
  }

  buildPathWithSegments(
    route: string,
    params: Params,
    segments: readonly unknown[],
  ): string {
    return this.#legacyRouter.buildPathWithSegments(route, params, segments);
  }

  matchPath<P extends Params = Params, MP extends Params = Params>(
    path: string,
    source?: string,
  ): State<P, MP> | undefined {
    return this.#legacyRouter.matchPath<P, MP>(path, source);
  }

  setRootPath(rootPath: string): void {
    this.#legacyRouter.setRootPath(rootPath);
  }

  getRootPath(): string {
    return this.#legacyRouter.getRootPath();
  }

  // ============================================================================
  // State Management
  // ============================================================================

  makeState<P extends Params = Params, MP extends Params = Params>(
    name: string,
    params?: P,
    path?: string,
    meta?: StateMetaInput<MP>,
    forceId?: number,
  ): State<P, MP> {
    return this.#legacyRouter.makeState<P, MP>(
      name,
      params,
      path,
      meta,
      forceId,
    );
  }

  makeNotFoundState(path: string, options?: NavigationOptions): State {
    return this.#legacyRouter.makeNotFoundState(path, options);
  }

  getState<P extends Params = Params, MP extends Params = Params>():
    | State<P, MP>
    | undefined {
    return this.#legacyRouter.getState<P, MP>();
  }

  setState<P extends Params = Params, MP extends Params = Params>(
    state?: State<P, MP>,
  ): void {
    this.#legacyRouter.setState<P, MP>(state);
  }

  getPreviousState(): State | undefined {
    return this.#legacyRouter.getPreviousState();
  }

  areStatesEqual(
    state1: State | undefined,
    state2: State | undefined,
    ignoreQueryParams?: boolean,
  ): boolean {
    return this.#legacyRouter.areStatesEqual(state1, state2, ignoreQueryParams);
  }

  areStatesDescendants(parentState: State, childState: State): boolean {
    return this.#legacyRouter.areStatesDescendants(parentState, childState);
  }

  forwardState<P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ): { name: string; params: P } {
    return this.#legacyRouter.forwardState<P>(routeName, routeParams);
  }

  buildState(
    routeName: string,
    routeParams: Params,
  ): RouteTreeState | undefined {
    return this.#legacyRouter.buildState(routeName, routeParams);
  }

  buildStateWithSegments<P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ): BuildStateResultWithSegments<P> | undefined {
    return this.#legacyRouter.buildStateWithSegments<P>(routeName, routeParams);
  }

  shouldUpdateNode(
    nodeName: string,
  ): (toState: State, fromState?: State) => boolean {
    return this.#legacyRouter.shouldUpdateNode(nodeName);
  }

  // ============================================================================
  // Options
  // ============================================================================

  getOptions(): Options {
    return this.#legacyRouter.getOptions();
  }

  setOption(option: keyof Options, value: Options[keyof Options]): this {
    this.#legacyRouter.setOption(option, value);

    return this;
  }

  // ============================================================================
  // Router Lifecycle
  // ============================================================================

  isStarted(): boolean {
    return this.#legacyRouter.isStarted();
  }

  isActive(): boolean {
    return this.#legacyRouter.isActive();
  }

  isNavigating(): boolean {
    return this.#legacyRouter.isNavigating();
  }

  start(startPathOrState?: string | State | DoneFn, done?: DoneFn): this {
    if (typeof startPathOrState === "function") {
      this.#legacyRouter.start(startPathOrState);
    } else if (startPathOrState !== undefined && done !== undefined) {
      this.#legacyRouter.start(startPathOrState, done);
    } else if (startPathOrState === undefined) {
      this.#legacyRouter.start();
    } else {
      this.#legacyRouter.start(startPathOrState);
    }

    return this;
  }

  stop(): this {
    this.#legacyRouter.stop();

    return this;
  }

  // ============================================================================
  // Route Lifecycle (Guards)
  // ============================================================================

  canDeactivate(
    name: string,
    canDeactivateHandler: ActivationFnFactory<Dependencies> | boolean,
  ): this {
    this.#legacyRouter.canDeactivate(name, canDeactivateHandler);

    return this;
  }

  clearCanDeactivate(name: string, silent?: boolean): this {
    this.#legacyRouter.clearCanDeactivate(name, silent);

    return this;
  }

  canActivate(
    name: string,
    canActivateHandler: ActivationFnFactory<Dependencies> | boolean,
  ): this {
    this.#legacyRouter.canActivate(name, canActivateHandler);

    return this;
  }

  clearCanActivate(name: string, silent?: boolean): this {
    this.#legacyRouter.clearCanActivate(name, silent);

    return this;
  }

  getLifecycleFactories(): [
    Record<string, ActivationFnFactory<Dependencies>>,
    Record<string, ActivationFnFactory<Dependencies>>,
  ] {
    return this.#legacyRouter.getLifecycleFactories();
  }

  getLifecycleFunctions(): [
    Map<string, ActivationFn>,
    Map<string, ActivationFn>,
  ] {
    return this.#legacyRouter.getLifecycleFunctions();
  }

  // ============================================================================
  // Plugins
  // ============================================================================

  usePlugin(...plugins: PluginFactory<Dependencies>[]): Unsubscribe {
    return this.#legacyRouter.usePlugin(...plugins);
  }

  getPlugins(): PluginFactory<Dependencies>[] {
    return this.#legacyRouter.getPlugins();
  }

  // ============================================================================
  // Middleware
  // ============================================================================

  useMiddleware(
    ...middlewares: MiddlewareFactory<Dependencies>[]
  ): Unsubscribe {
    return this.#legacyRouter.useMiddleware(...middlewares);
  }

  clearMiddleware(): this {
    this.#legacyRouter.clearMiddleware();

    return this;
  }

  getMiddlewareFactories(): MiddlewareFactory<Dependencies>[] {
    return this.#legacyRouter.getMiddlewareFactories();
  }

  getMiddlewareFunctions(): Middleware[] {
    return this.#legacyRouter.getMiddlewareFunctions();
  }

  // ============================================================================
  // Dependencies
  // ============================================================================

  setDependency<K extends keyof Dependencies & string>(
    dependencyName: K,
    dependency: Dependencies[K],
  ): this {
    this.#legacyRouter.setDependency(dependencyName, dependency);

    return this;
  }

  setDependencies(deps: Dependencies): this {
    this.#legacyRouter.setDependencies(deps);

    return this;
  }

  getDependency<K extends keyof Dependencies>(key: K): Dependencies[K] {
    return this.#legacyRouter.getDependency(key);
  }

  getDependencies(): Partial<Dependencies> {
    return this.#legacyRouter.getDependencies();
  }

  removeDependency(dependencyName: keyof Dependencies): this {
    this.#legacyRouter.removeDependency(dependencyName);

    return this;
  }

  hasDependency(dependencyName: keyof Dependencies): boolean {
    return this.#legacyRouter.hasDependency(dependencyName);
  }

  resetDependencies(): this {
    this.#legacyRouter.resetDependencies();

    return this;
  }

  // ============================================================================
  // Events
  // ============================================================================

  invokeEventListeners(
    eventName: EventToNameMap[EventsKeys],
    toState?: State,
    fromState?: State,
    arg?: RouterError | NavigationOptions,
  ): void {
    this.#legacyRouter.invokeEventListeners(eventName, toState, fromState, arg);
  }

  hasListeners(eventName: EventToNameMap[EventsKeys]): boolean {
    return this.#legacyRouter.hasListeners(eventName);
  }

  removeEventListener(
    eventName: EventToNameMap[EventsKeys],
    cb: Plugin[keyof Plugin],
  ): void {
    this.#legacyRouter.removeEventListener(eventName, cb);
  }

  addEventListener(
    eventName: EventToNameMap[EventsKeys],
    cb: Plugin[keyof Plugin],
  ): Unsubscribe {
    return this.#legacyRouter.addEventListener(eventName, cb);
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  forward(fromRoute: string, toRoute: string): this {
    this.#legacyRouter.forward(fromRoute, toRoute);

    return this;
  }

  /* eslint-disable @typescript-eslint/no-non-null-assertion -- overload handling requires assertions */
  navigate(
    routeName: string,
    routeParamsOrDone?: Params | DoneFn,
    optionsOrDone?: NavigationOptions | DoneFn,
    done?: DoneFn,
  ): CancelFn {
    if (typeof routeParamsOrDone === "function") {
      return this.#legacyRouter.navigate(routeName, routeParamsOrDone);
    }
    if (typeof optionsOrDone === "function") {
      return this.#legacyRouter.navigate(
        routeName,
        routeParamsOrDone!,
        optionsOrDone,
      );
    }
    if (done !== undefined) {
      return this.#legacyRouter.navigate(
        routeName,
        routeParamsOrDone!,
        optionsOrDone!,
        done,
      );
    }
    if (optionsOrDone !== undefined) {
      return this.#legacyRouter.navigate(
        routeName,
        routeParamsOrDone!,
        optionsOrDone,
      );
    }
    if (routeParamsOrDone !== undefined) {
      return this.#legacyRouter.navigate(routeName, routeParamsOrDone);
    }

    return this.#legacyRouter.navigate(routeName);
  }

  navigateToDefault(
    optsOrDone?: NavigationOptions | DoneFn,
    done?: DoneFn,
  ): CancelFn {
    if (typeof optsOrDone === "function") {
      return this.#legacyRouter.navigateToDefault(optsOrDone);
    }
    if (done !== undefined) {
      return this.#legacyRouter.navigateToDefault(optsOrDone!, done);
    }
    if (optsOrDone !== undefined) {
      return this.#legacyRouter.navigateToDefault(optsOrDone);
    }

    return this.#legacyRouter.navigateToDefault();
  }
  /* eslint-enable @typescript-eslint/no-non-null-assertion */

  navigateToState(
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
    callback: DoneFn,
    emitSuccess: boolean,
  ): CancelFn {
    return this.#legacyRouter.navigateToState(
      toState,
      fromState,
      opts,
      callback,
      emitSuccess,
    );
  }

  // ============================================================================
  // Subscription
  // ============================================================================

  subscribe(listener: SubscribeFn): Unsubscribe {
    return this.#legacyRouter.subscribe(listener);
  }

  // ============================================================================
  // Cloning
  // ============================================================================

  clone(dependencies?: Dependencies): RouterInterface<Dependencies> {
    // Delegate to legacy router - returns legacy router instance, not Router class
    // TODO: Wrap in Router class when architecture is stabilized
    return this.#legacyRouter.clone(dependencies);
  }
}
