// packages/core/src/Router.ts

/**
 * Router class - facade with integrated namespaces.
 *
 * This is Phase 2 of RFC-1 "Fort Knox" architecture.
 * Namespaces handle Options, Dependencies, Observable (events), and State storage.
 * Remaining decorators handle complex functionality that depends on route tree.
 */

import { logger } from "@real-router/logger";

import {
  CONFIG_SYMBOL,
  RESOLVED_FORWARD_MAP_SYMBOL,
  ROOT_PATH_SYMBOL,
  ROOT_TREE_SYMBOL,
  ROUTE_DEFINITIONS_SYMBOL,
} from "./constants";
import { withMiddleware } from "./core/middleware";
import { withNavigation } from "./core/navigation";
import { withPlugins } from "./core/plugins";
import { withRouteLifecycle } from "./core/routeLifecycle";
import { withRouterLifecycle } from "./core/routerLifecycle";
import { withRoutes } from "./core/routes";
import { withState } from "./core/state";
import {
  DependenciesNamespace,
  ObservableNamespace,
  OptionsNamespace,
  StateNamespace,
} from "./namespaces";
import { isLoggerConfig } from "./typeGuards";

import type {
  ActivationFn,
  ActivationFnFactory,
  BuildStateResultWithSegments,
  CancelFn,
  Config,
  DefaultDependencies,
  DoneFn,
  EventName,
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
 * Router class with integrated namespace architecture.
 *
 * Namespaces provide:
 * - OptionsNamespace: getOptions, setOption
 * - DependenciesNamespace: get/set/remove dependencies
 * - ObservableNamespace: event listeners, subscribe
 * - StateNamespace: state storage (getState, setState, getPreviousState)
 *
 * Decorators still provide:
 * - withState: makeState, buildState, forwardState, areStatesEqual, etc.
 * - withRouterLifecycle: start, stop, isStarted
 * - withRouteLifecycle: canActivate, canDeactivate
 * - withNavigation: navigate, navigateToState
 * - withPlugins: usePlugin
 * - withMiddleware: useMiddleware
 * - withRoutes: addRoute, removeRoute, etc.
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

  // ============================================================================
  // Namespaces
  // ============================================================================

  readonly #options: OptionsNamespace;
  readonly #dependencies: DependenciesNamespace<Dependencies>;
  readonly #observable: ObservableNamespace;
  readonly #state: StateNamespace;

  // Legacy router for decorators not yet converted to namespaces
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
    // Configure logger if provided
    if (options.logger && isLoggerConfig(options.logger)) {
      logger.configure(options.logger);
      delete options.logger;
    }

    // =========================================================================
    // Validate inputs before creating namespaces
    // =========================================================================

    OptionsNamespace.validateOptions(options, "constructor");
    DependenciesNamespace.validateDependenciesObject(
      dependencies,
      "constructor",
    );

    // =========================================================================
    // Create Namespaces
    // =========================================================================

    this.#options = new OptionsNamespace(options);
    this.#dependencies = new DependenciesNamespace<Dependencies>(dependencies);
    this.#observable = new ObservableNamespace();
    this.#state = new StateNamespace();

    // =========================================================================
    // Build Uninitialized Router with Namespace-Backed Methods
    // =========================================================================

    const config: Config = {
      decoders: {},
      encoders: {},
      defaultParams: {},
      forwardMap: {},
    };

    // Store references for closures
    const optionsNs = this.#options;
    const dependenciesNs = this.#dependencies;
    const observableNs = this.#observable;
    const stateNs = this.#state;

    // Create router object with namespace-backed methods
    // These methods will be used by subsequent decorators
    const uninitializedRouter = {
      [CONFIG_SYMBOL]: config,

      // =====================================================================
      // Options (backed by OptionsNamespace)
      // =====================================================================
      getOptions: () => optionsNs.get(),
      setOption: <K extends keyof Options>(
        optionName: K,
        value: Options[K],
      ): LegacyRouter<Dependencies> => {
        OptionsNamespace.validateOptionName(optionName, "setOption");
        OptionsNamespace.validateOptionValue(optionName, value, "setOption");
        optionsNs.set(optionName, value);

        return uninitializedRouter as unknown as LegacyRouter<Dependencies>;
      },

      // =====================================================================
      // Dependencies (backed by DependenciesNamespace)
      // =====================================================================
      setDependency: <K extends keyof Dependencies & string>(
        dependencyName: K,
        dependencyValue: Dependencies[K],
      ): LegacyRouter<Dependencies> => {
        DependenciesNamespace.validateName(dependencyName, "setDependency");
        dependenciesNs.set(dependencyName, dependencyValue);

        return uninitializedRouter as unknown as LegacyRouter<Dependencies>;
      },
      setDependencies: (
        deps: Partial<Dependencies>,
      ): LegacyRouter<Dependencies> => {
        DependenciesNamespace.validateDependenciesObject(
          deps,
          "setDependencies",
        );
        dependenciesNs.setMultiple(deps);

        return uninitializedRouter as unknown as LegacyRouter<Dependencies>;
      },
      getDependency: <K extends keyof Dependencies>(
        dependencyName: K,
      ): Dependencies[K] => {
        DependenciesNamespace.validateName(dependencyName, "getDependency");

        return dependenciesNs.get(dependencyName);
      },
      getDependencies: (): Partial<Dependencies> => dependenciesNs.getAll(),
      removeDependency: (
        dependencyName: keyof Dependencies,
      ): LegacyRouter<Dependencies> => {
        DependenciesNamespace.validateName(dependencyName, "removeDependency");
        dependenciesNs.remove(dependencyName);

        return uninitializedRouter as unknown as LegacyRouter<Dependencies>;
      },
      hasDependency: (dependencyName: keyof Dependencies): boolean => {
        DependenciesNamespace.validateName(dependencyName, "hasDependency");

        return dependenciesNs.has(dependencyName);
      },
      resetDependencies: (): LegacyRouter<Dependencies> => {
        dependenciesNs.reset();

        return uninitializedRouter as unknown as LegacyRouter<Dependencies>;
      },

      // =====================================================================
      // Observable/Events (backed by ObservableNamespace)
      // =====================================================================
      invokeEventListeners: (
        eventName: EventToNameMap[EventsKeys],
        toState?: State,
        fromState?: State,
        arg?: RouterError | NavigationOptions,
      ): void => {
        ObservableNamespace.validateInvokeArgs(
          eventName,
          toState,
          fromState,
          arg,
        );
        observableNs.invoke(eventName as EventName, toState, fromState, arg);
      },
      hasListeners: (eventName: EventToNameMap[EventsKeys]): boolean => {
        ObservableNamespace.validateEventName(eventName);

        return observableNs.hasListeners(eventName);
      },
      removeEventListener: (
        eventName: EventName,
        cb: Plugin[keyof Plugin],
      ): void => {
        ObservableNamespace.validateListenerArgs(eventName, cb);
        /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
        observableNs.removeEventListener(eventName, cb as any);
        /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
      },
      addEventListener: (
        eventName: EventName,
        cb: Plugin[keyof Plugin],
      ): Unsubscribe => {
        ObservableNamespace.validateListenerArgs(eventName, cb);

        /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
        return observableNs.addEventListener(eventName, cb as any);
        /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
      },
      subscribe: (listener: SubscribeFn): Unsubscribe => {
        ObservableNamespace.validateSubscribeListener(listener);

        return observableNs.subscribe(listener);
      },

      // =====================================================================
      // State Storage (backed by StateNamespace)
      // Note: Complex state methods (makeState, etc.) added by withState
      // =====================================================================
      getState: <P extends Params = Params, MP extends Params = Params>():
        | State<P, MP>
        | undefined => stateNs.get<P, MP>(),
      setState: (state: State | undefined): void => {
        stateNs.set(state);
      },
      getPreviousState: <
        P extends Params = Params,
        MP extends Params = Params,
      >(): State<P, MP> | undefined => stateNs.getPrevious<P, MP>(),
    };

    // =========================================================================
    // Apply Remaining Decorators
    // =========================================================================
    // Decorators removed (replaced by namespaces):
    // - withOptions
    // - withDependencies
    // - withObservability
    //
    // withState is partially replaced - storage is in StateNamespace,
    // but complex methods (makeState, buildState, etc.) still need decorator
    // =========================================================================

    this.#legacyRouter = pipe<Dependencies>(
      withState, // Adds makeState, buildState, forwardState, areStatesEqual, etc.
      withRouterLifecycle, // Adds start, stop, isStarted - uses invokeEventListeners
      withRouteLifecycle, // Adds canActivate, canDeactivate
      withNavigation, // Adds navigate, navigateToState
      withPlugins, // Adds usePlugin
      withMiddleware, // Adds useMiddleware
      withRoutes(routes), // Adds addRoute, removeRoute, etc.
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
  // State Management (mixed: namespace + decorator)
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

  // Delegated to legacyRouter (withState decorator manages state)
  // Note: StateNamespace provides initial implementation but withState overwrites it
  getState<P extends Params = Params, MP extends Params = Params>():
    | State<P, MP>
    | undefined {
    return this.#legacyRouter.getState<P, MP>();
  }

  // Delegated to legacyRouter (withState decorator manages state)
  setState<P extends Params = Params, MP extends Params = Params>(
    state?: State<P, MP>,
  ): void {
    this.#legacyRouter.setState<P, MP>(state);
  }

  // Delegated to legacyRouter (withState decorator manages state)
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
  // Options (backed by OptionsNamespace)
  // ============================================================================

  getOptions(): Options {
    return this.#options.get();
  }

  setOption(option: keyof Options, value: Options[keyof Options]): this {
    OptionsNamespace.validateOptionName(option, "setOption");
    OptionsNamespace.validateOptionValue(option, value, "setOption");
    this.#options.set(option, value);

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
    // Lock options when router starts
    this.#options.lock();

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
    // Unlock options when router stops
    this.#options.unlock();

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
  // Dependencies (backed by DependenciesNamespace)
  // ============================================================================

  setDependency<K extends keyof Dependencies & string>(
    dependencyName: K,
    dependency: Dependencies[K],
  ): this {
    DependenciesNamespace.validateName(dependencyName, "setDependency");
    this.#dependencies.set(dependencyName, dependency);

    return this;
  }

  setDependencies(deps: Dependencies): this {
    DependenciesNamespace.validateDependenciesObject(deps, "setDependencies");
    this.#dependencies.setMultiple(deps);

    return this;
  }

  getDependency<K extends keyof Dependencies>(key: K): Dependencies[K] {
    DependenciesNamespace.validateName(key, "getDependency");

    return this.#dependencies.get(key);
  }

  getDependencies(): Partial<Dependencies> {
    return this.#dependencies.getAll();
  }

  removeDependency(dependencyName: keyof Dependencies): this {
    DependenciesNamespace.validateName(dependencyName, "removeDependency");
    this.#dependencies.remove(dependencyName);

    return this;
  }

  hasDependency(dependencyName: keyof Dependencies): boolean {
    DependenciesNamespace.validateName(dependencyName, "hasDependency");

    return this.#dependencies.has(dependencyName);
  }

  resetDependencies(): this {
    this.#dependencies.reset();

    return this;
  }

  // ============================================================================
  // Events (backed by ObservableNamespace)
  // ============================================================================

  invokeEventListeners(
    eventName: EventToNameMap[EventsKeys],
    toState?: State,
    fromState?: State,
    arg?: RouterError | NavigationOptions,
  ): void {
    ObservableNamespace.validateInvokeArgs(eventName, toState, fromState, arg);
    this.#observable.invoke(eventName as EventName, toState, fromState, arg);
  }

  hasListeners(eventName: EventToNameMap[EventsKeys]): boolean {
    ObservableNamespace.validateEventName(eventName);

    return this.#observable.hasListeners(eventName);
  }

  removeEventListener(
    eventName: EventToNameMap[EventsKeys],
    cb: Plugin[keyof Plugin],
  ): void {
    ObservableNamespace.validateListenerArgs(eventName as EventName, cb);
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
    this.#observable.removeEventListener(eventName as EventName, cb as any);
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
  }

  addEventListener(
    eventName: EventToNameMap[EventsKeys],
    cb: Plugin[keyof Plugin],
  ): Unsubscribe {
    ObservableNamespace.validateListenerArgs(eventName as EventName, cb);

    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
    return this.#observable.addEventListener(eventName as EventName, cb as any);
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
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
  // Subscription (backed by ObservableNamespace)
  // ============================================================================

  subscribe(listener: SubscribeFn): Unsubscribe {
    ObservableNamespace.validateSubscribeListener(listener);

    return this.#observable.subscribe(listener);
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
