// packages/core/src/Router.ts

/**
 * Router class - facade with integrated namespaces.
 *
 * This is Phase 5 of RFC-1 "Fort Knox" architecture.
 * All functionality is now provided by namespace classes.
 */

import { logger } from "@real-router/logger";
import { getSegmentsByName } from "route-tree";
import { validateRouteName, validateState } from "type-guards";

import { createRouteState } from "./core/stateBuilder";
import {
  CloneNamespace,
  DependenciesNamespace,
  MiddlewareNamespace,
  NavigationNamespace,
  ObservableNamespace,
  OptionsNamespace,
  PluginsNamespace,
  RouteLifecycleNamespace,
  RouterLifecycleNamespace,
  RoutesNamespace,
  StateNamespace,
} from "./namespaces";
import { isLoggerConfig } from "./typeGuards";

import type { RouterObservable } from "./namespaces/ObservableNamespace/ObservableNamespace";
import type {
  ActivationFn,
  ActivationFnFactory,
  BuildStateResultWithSegments,
  CancelFn,
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
  RouterError as RouterErrorType,
  RouteTreeState,
  SimpleState,
  State,
  StateMetaInput,
  SubscribeFn,
  Unsubscribe,
} from "@real-router/types";

/**
 * Router class with integrated namespace architecture.
 *
 * All functionality is provided by namespace classes:
 * - OptionsNamespace: getOptions, setOption
 * - DependenciesNamespace: get/set/remove dependencies
 * - ObservableNamespace: event listeners, subscribe
 * - StateNamespace: state storage (getState, setState, getPreviousState)
 * - RoutesNamespace: route tree operations
 * - RouteLifecycleNamespace: canActivate/canDeactivate guards
 * - MiddlewareNamespace: middleware chain
 * - PluginsNamespace: plugin lifecycle
 * - NavigationNamespace: navigate, navigateToState
 * - RouterLifecycleNamespace: start, stop, isStarted
 *
 * @internal This class implementation is internal. Use createRouter() instead.
 */
export class Router<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> implements RouterInterface<Dependencies> {
  // Index signatures to satisfy interface
  [key: symbol]: unknown;
  [key: string]: unknown;

  // ============================================================================
  // Namespaces
  // ============================================================================

  readonly #options: OptionsNamespace;
  readonly #dependencies: DependenciesNamespace<Dependencies>;
  readonly #observable: ObservableNamespace;
  readonly #state: StateNamespace;
  readonly #routes: RoutesNamespace<Dependencies>;
  readonly #routeLifecycle: RouteLifecycleNamespace<Dependencies>;
  readonly #middleware: MiddlewareNamespace<Dependencies>;
  readonly #plugins: PluginsNamespace<Dependencies>;
  readonly #navigation: NavigationNamespace<Dependencies>;
  readonly #lifecycle: RouterLifecycleNamespace<Dependencies>;
  readonly #clone: CloneNamespace<Dependencies>;

  // ============================================================================
  // Constructor
  // ============================================================================

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
    this.#routes = new RoutesNamespace<Dependencies>(routes);
    this.#routeLifecycle = new RouteLifecycleNamespace<Dependencies>();
    this.#middleware = new MiddlewareNamespace<Dependencies>();
    this.#plugins = new PluginsNamespace<Dependencies>();
    this.#navigation = new NavigationNamespace<Dependencies>();
    this.#lifecycle = new RouterLifecycleNamespace<Dependencies>();
    this.#clone = new CloneNamespace<Dependencies>();

    // =========================================================================
    // Setup Dependencies
    // =========================================================================

    this.#setupDependencies();
  }

  // ============================================================================
  // Route Management
  // ============================================================================

  addRoute(routes: Route<Dependencies>[] | Route<Dependencies>): this {
    const routeArray = Array.isArray(routes) ? routes : [routes];

    // Static validation (route structure and properties)
    RoutesNamespace.validateAddRouteArgs(routeArray);

    // Instance method handles state-dependent validation (duplicates, tree)
    this.#routes.addRoutes(routeArray);

    return this;
  }

  removeRoute(name: string): this {
    // Static validation
    RoutesNamespace.validateRemoveRouteArgs(name);

    // Instance validation (checks active route, navigation state)
    const canRemove = this.#routes.validateRemoveRoute(
      name,
      this.#state.get()?.name,
      this.#navigation.isNavigating(),
    );

    if (!canRemove) {
      return this;
    }

    // Perform removal
    const wasRemoved = this.#routes.removeRoute(name);

    if (!wasRemoved) {
      logger.warn(
        "router.removeRoute",
        `Route "${name}" not found. No changes made.`,
      );
    }

    return this;
  }

  clearRoutes(): this {
    // Validate operation can proceed
    const canClear = this.#routes.validateClearRoutes(
      this.#navigation.isNavigating(),
    );

    if (!canClear) {
      return this;
    }

    // Clear routes config (definitions, decoders, encoders, defaultParams, forwardMap)
    this.#routes.clearRoutes();

    // Clear all lifecycle handlers
    this.#routeLifecycle.clearAll();

    // Clear router state since all routes are removed
    this.#state.set(undefined);

    return this;
  }

  getRoute(name: string): Route<Dependencies> | undefined {
    validateRouteName(name, "getRoute");

    return this.#routes.getRoute(name);
  }

  hasRoute(name: string): boolean {
    validateRouteName(name, "hasRoute");

    return this.#routes.hasRoute(name);
  }

  updateRoute(name: string, updates: RouteConfigUpdate<Dependencies>): this {
    // Validate name and updates object structure (basic checks only)
    RoutesNamespace.validateUpdateRouteBasicArgs(name, updates);

    // Cache all property values upfront to protect against mutating getters.
    // This ensures consistent behavior regardless of getter side effects.
    // Must happen AFTER basic validation but BEFORE property type validation.
    const {
      forwardTo,
      defaultParams,
      decodeParams,
      encodeParams,
      canActivate,
    } = updates;

    // Validate cached property values
    RoutesNamespace.validateUpdateRoutePropertyTypes(
      forwardTo,
      defaultParams,
      decodeParams,
      encodeParams,
    );

    // Warn if navigation is in progress
    if (this.#navigation.isNavigating()) {
      logger.error(
        "router.updateRoute",
        `Updating route "${name}" while navigation is in progress. This may cause unexpected behavior.`,
      );
    }

    // Instance validation (route existence, forwardTo checks) - use cached values
    this.#routes.validateUpdateRoute(name, forwardTo);

    // Update route config
    this.#routes.updateRouteConfig(name, {
      forwardTo,
      defaultParams,
      decodeParams,
      encodeParams,
    });

    // Handle canActivate separately (uses RouteLifecycleNamespace)
    if (canActivate !== undefined) {
      if (canActivate === null) {
        this.#routeLifecycle.clearCanActivate(name, true);
      } else {
        this.#routeLifecycle.registerCanActivate(name, canActivate);
      }
    }

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
    RoutesNamespace.validateIsActiveRouteArgs(
      name,
      params,
      strictEquality,
      ignoreQueryParams,
    );

    // Empty string is special case - warn and return false (root node is not a parent)
    if (name === "") {
      logger.warn(
        "real-router",
        'isActiveRoute("") called with empty string. Root node is not considered a parent of any route.',
      );

      return false;
    }

    return this.#routes.isActiveRoute(
      name,
      params,
      strictEquality,
      ignoreQueryParams,
    );
  }

  buildPath(route: string, params?: Params): string {
    RoutesNamespace.validateBuildPathArgs(route);

    return this.#routes.buildPath(route, params, this.#options.get());
  }

  buildPathWithSegments(route: string, params: Params): string {
    // Note: segments parameter is kept for API compatibility but not used
    // because RoutesNamespace.buildPath handles segment lookup internally
    return this.buildPath(route, params);
  }

  matchPath<P extends Params = Params, MP extends Params = Params>(
    path: string,
    source?: string,
  ): State<P, MP> | undefined {
    RoutesNamespace.validateMatchPathArgs(path);

    return this.#routes.matchPath<P, MP>(path, source, this.#options.get());
  }

  setRootPath(rootPath: string): void {
    RoutesNamespace.validateSetRootPathArgs(rootPath);
    this.#routes.setRootPath(rootPath);
  }

  getRootPath(): string {
    return this.#routes.getRootPath();
  }

  // ============================================================================
  // State Management (delegated to StateNamespace)
  // ============================================================================

  makeState<P extends Params = Params, MP extends Params = Params>(
    name: string,
    params?: P,
    path?: string,
    meta?: StateMetaInput<MP>,
    forceId?: number,
  ): State<P, MP> {
    StateNamespace.validateMakeStateArgs(name, params, path, forceId);

    return this.#state.makeState<P, MP>(name, params, path, meta, forceId);
  }

  makeNotFoundState(path: string, options?: NavigationOptions): State {
    StateNamespace.validateMakeNotFoundStateArgs(path, options);

    return this.#state.makeNotFoundState(path, options);
  }

  getState<P extends Params = Params, MP extends Params = Params>():
    | State<P, MP>
    | undefined {
    return this.#state.get<P, MP>();
  }

  setState<P extends Params = Params, MP extends Params = Params>(
    state?: State<P, MP>,
  ): void {
    if (state !== undefined) {
      validateState(state, "router.setState");
    }

    this.#state.set(state);
  }

  getPreviousState(): State | undefined {
    return this.#state.getPrevious();
  }

  areStatesEqual(
    state1: State | undefined,
    state2: State | undefined,
    ignoreQueryParams = true,
  ): boolean {
    StateNamespace.validateAreStatesEqualArgs(
      state1,
      state2,
      ignoreQueryParams,
    );

    return this.#state.areStatesEqual(state1, state2, ignoreQueryParams);
  }

  areStatesDescendants(parentState: State, childState: State): boolean {
    StateNamespace.validateAreStatesDescendantsArgs(parentState, childState);

    // eslint-disable-next-line @typescript-eslint/no-deprecated, sonarjs/deprecation -- facade for deprecated method
    return this.#state.areStatesDescendants(parentState, childState);
  }

  forwardState<P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ): SimpleState<P> {
    RoutesNamespace.validateStateBuilderArgs(
      routeName,
      routeParams,
      "forwardState",
    );

    return this.#routes.forwardState<P>(routeName, routeParams);
  }

  buildState(
    routeName: string,
    routeParams: Params,
  ): RouteTreeState | undefined {
    RoutesNamespace.validateStateBuilderArgs(
      routeName,
      routeParams,
      "buildState",
    );

    const { name, params } = this.forwardState(routeName, routeParams);
    const segments = getSegmentsByName(this.#routes.getTree(), name);

    if (!segments) {
      return undefined;
    }

    return createRouteState({ segments, params }, name);
  }

  buildStateWithSegments<P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ): BuildStateResultWithSegments<P> | undefined {
    RoutesNamespace.validateStateBuilderArgs(
      routeName,
      routeParams,
      "buildStateWithSegments",
    );

    const { name, params } = this.forwardState(routeName, routeParams);
    const segments = getSegmentsByName(this.#routes.getTree(), name);

    if (!segments) {
      return undefined;
    }

    const state = createRouteState<P>({ segments, params }, name);

    return { state, segments };
  }

  shouldUpdateNode(
    nodeName: string,
  ): (toState: State, fromState?: State) => boolean {
    RoutesNamespace.validateShouldUpdateNodeArgs(nodeName);

    return this.#routes.shouldUpdateNode(nodeName);
  }

  // ============================================================================
  // Options (backed by OptionsNamespace)
  // ============================================================================

  getOptions(): Options {
    return this.#options.get();
  }

  getOption<K extends keyof Options>(option: K): Options[K] {
    OptionsNamespace.validateOptionName(option, "getOption");

    return this.#options.getOption(option);
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
    return this.#lifecycle.isStarted();
  }

  isActive(): boolean {
    return this.#lifecycle.isActive();
  }

  isNavigating(): boolean {
    return this.#navigation.isNavigating();
  }

  start(
    ...args:
      | []
      | [done: DoneFn]
      | [startPathOrState: string | State]
      | [startPathOrState: string | State, done: DoneFn]
  ): this {
    // Static validation
    RouterLifecycleNamespace.validateStartArgs(args);

    // Lock options when router starts
    this.#options.lock();

    // Initialize build options cache
    this.#routes.initBuildOptionsCache(this.#options.get());

    // Forward to lifecycle namespace
    this.#lifecycle.start(...args);

    return this;
  }

  stop(): this {
    this.#lifecycle.stop();

    // Clear build options cache
    this.#routes.clearBuildOptionsCache();

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
    validateRouteName(name, "canDeactivate");
    RouteLifecycleNamespace.validateHandler(
      canDeactivateHandler,
      "canDeactivate",
    );
    this.#routeLifecycle.registerCanDeactivate(name, canDeactivateHandler);

    return this;
  }

  clearCanDeactivate(name: string, silent?: boolean): this {
    validateRouteName(name, "clearCanDeactivate");
    this.#routeLifecycle.clearCanDeactivate(name, silent);

    return this;
  }

  canActivate(
    name: string,
    canActivateHandler: ActivationFnFactory<Dependencies> | boolean,
  ): this {
    validateRouteName(name, "canActivate");
    RouteLifecycleNamespace.validateHandler(canActivateHandler, "canActivate");

    this.#routeLifecycle.registerCanActivate(name, canActivateHandler);

    return this;
  }

  clearCanActivate(name: string, silent?: boolean): this {
    validateRouteName(name, "clearCanActivate");
    this.#routeLifecycle.clearCanActivate(name, silent);

    return this;
  }

  getLifecycleFactories(): [
    Record<string, ActivationFnFactory<Dependencies>>,
    Record<string, ActivationFnFactory<Dependencies>>,
  ] {
    return this.#routeLifecycle.getFactories();
  }

  getLifecycleFunctions(): [
    Map<string, ActivationFn>,
    Map<string, ActivationFn>,
  ] {
    return this.#routeLifecycle.getFunctions();
  }

  // ============================================================================
  // Plugins
  // ============================================================================

  usePlugin(...plugins: PluginFactory<Dependencies>[]): Unsubscribe {
    PluginsNamespace.validateUsePluginArgs<Dependencies>(plugins);

    return this.#plugins.use(...plugins);
  }

  getPlugins(): PluginFactory<Dependencies>[] {
    return this.#plugins.getAll();
  }

  // ============================================================================
  // Middleware
  // ============================================================================

  useMiddleware(
    ...middlewares: MiddlewareFactory<Dependencies>[]
  ): Unsubscribe {
    MiddlewareNamespace.validateUseMiddlewareArgs<Dependencies>(middlewares);

    return this.#middleware.use(...middlewares);
  }

  clearMiddleware(): this {
    this.#middleware.clear();

    return this;
  }

  getMiddlewareFactories(): MiddlewareFactory<Dependencies>[] {
    return this.#middleware.getFactories();
  }

  getMiddlewareFunctions(): Middleware[] {
    return this.#middleware.getFunctions();
  }

  // ============================================================================
  // Dependencies (backed by DependenciesNamespace)
  // ============================================================================

  setDependency<K extends keyof Dependencies & string>(
    dependencyName: K,
    dependency: Dependencies[K],
  ): this {
    DependenciesNamespace.validateSetDependencyArgs(dependencyName, dependency);
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
    arg?: RouterErrorType | NavigationOptions,
  ): void {
    ObservableNamespace.validateInvokeArgs(eventName, toState, fromState, arg);
    this.#observable.invoke(eventName as EventName, toState, fromState, arg);
  }

  hasListeners(eventName: EventToNameMap[EventsKeys]): boolean {
    // No validation - return false for invalid event names (matches original behavior)
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
    // Static validation (argument types)
    RoutesNamespace.validateForwardArgs(fromRoute, toRoute);

    // Instance validation and mutation (route existence, param compatibility, cycles)
    this.#routes.forward(fromRoute, toRoute);

    return this;
  }

  navigate(
    routeName: string,
    routeParamsOrDone?: Params | DoneFn,
    optionsOrDone?: NavigationOptions | DoneFn,
    done?: DoneFn,
  ): CancelFn {
    NavigationNamespace.validateNavigateArgs(routeName);

    return this.#navigation.navigate(
      routeName,
      routeParamsOrDone,
      optionsOrDone,
      done,
    );
  }

  navigateToDefault(
    optsOrDone?: NavigationOptions | DoneFn,
    done?: DoneFn,
  ): CancelFn {
    NavigationNamespace.validateNavigateToDefaultArgs(optsOrDone, done);

    return this.#navigation.navigateToDefault(optsOrDone, done);
  }

  navigateToState(
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
    callback: DoneFn,
    emitSuccess: boolean,
  ): CancelFn {
    NavigationNamespace.validateNavigateToStateArgs(
      toState,
      fromState,
      opts,
      callback,
      emitSuccess,
    );

    return this.#navigation.navigateToState(
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

  /**
   * TC39 Observable spec: router[Symbol.observable]() returns observable
   */
  [Symbol.observable](): RouterObservable {
    return this.#observable.observable();
  }

  /**
   * RxJS compatibility: router["@@observable"]() returns observable
   */
  ["@@observable"](): RouterObservable {
    return this.#observable.observable();
  }

  // ============================================================================
  // Cloning
  // ============================================================================

  clone(dependencies?: Dependencies): RouterInterface<Dependencies> {
    CloneNamespace.validateCloneArgs(dependencies);

    return this.#clone.clone(
      dependencies,
      (routes, options, deps) =>
        new Router<Dependencies>(routes, options, deps),
    );
  }

  // ============================================================================
  // Browser Plugin Stubs (overwritten by browser-plugin at runtime)
  // ============================================================================

  /**
   * Builds full URL for a route with base path and hash prefix.
   * This is a stub - actual implementation is provided by browser-plugin.
   *
   * @throws Error if called without browser-plugin
   */
  buildUrl(name: string, _params?: Params): string {
    throw new Error(
      `[router.buildUrl] Browser plugin is not installed. ` +
        `Install @real-router/browser-plugin and call router.usePlugin(browserPlugin()) to use buildUrl. ` +
        `Called with route: "${name}"`,
    );
  }

  /**
   * Matches URL and returns corresponding state.
   * This is a stub - actual implementation is provided by browser-plugin.
   *
   * @throws Error if called without browser-plugin
   */
  matchUrl(url: string): State | undefined {
    throw new Error(
      `[router.matchUrl] Browser plugin is not installed. ` +
        `Install @real-router/browser-plugin and call router.usePlugin(browserPlugin()) to use matchUrl. ` +
        `Called with URL: "${url}"`,
    );
  }

  /**
   * Replaces current history state without triggering navigation.
   * This is a stub - actual implementation is provided by browser-plugin.
   *
   * @throws Error if called without browser-plugin
   */
  replaceHistoryState(name: string, _params?: Params, _title?: string): void {
    throw new Error(
      `[router.replaceHistoryState] Browser plugin is not installed. ` +
        `Install @real-router/browser-plugin and call router.usePlugin(browserPlugin()) to use replaceHistoryState. ` +
        `Called with route: "${name}"`,
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Sets up dependencies between namespaces.
   * Called once in constructor after all namespaces are created.
   */
  #setupDependencies(): void {
    // Inject router reference into namespaces that need it
    // Using 'this' cast because Router implements RouterInterface
    const routerRef = this as unknown as RouterInterface<Dependencies>;

    // RouteLifecycleNamespace must be set up FIRST because RoutesNamespace.setRouter()
    // will register pending canActivate handlers which need RouteLifecycleNamespace
    this.#routeLifecycle.setRouter(routerRef);

    // Now set up RoutesNamespace (which will register pending canActivate handlers)
    this.#routes.setRouter(routerRef);
    this.#routes.setLifecycleNamespace(this.#routeLifecycle);

    this.#middleware.setRouter(routerRef);
    this.#plugins.setRouter(routerRef);
    this.#navigation.setRouter(routerRef);
    this.#lifecycle.setRouter(routerRef);

    // Observable needs access to state for replay feature
    this.#observable.setGetState(() => this.getState());

    // StateNamespace needs access to route config and path building
    this.#state.setDependencies({
      getDefaultParams: () => this.#routes.getConfig().defaultParams,
      buildPath: (name, params) =>
        this.#routes.buildPath(name, params, this.#options.get()),
      getUrlParams: (name) => {
        const segments = getSegmentsByName(this.#routes.getTree(), name);

        if (!segments) {
          return [];
        }

        // Named routes always have parsers (null only for root without path)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- route-tree guarantees parser for named routes
        return segments.flatMap((segment) => segment.parser!.urlParams);
      },
    });

    // =========================================================================
    // Setup cyclic dependencies via functional references
    // =========================================================================
    // Navigation → RouterLifecycle.isStarted() (check before navigation)
    // RouterLifecycle → Navigation.navigateToState() (for start transitions)
    // =========================================================================

    this.#navigation.isRouterStarted = () => this.#lifecycle.isStarted();

    // Use facade method so tests can spy on router.navigateToState
    this.#lifecycle.navigateToState = (
      toState: State,
      fromState: State | undefined,
      opts: NavigationOptions,
      callback: DoneFn,
      emitSuccess: boolean,
    ) => this.navigateToState(toState, fromState, opts, callback, emitSuccess);

    // CloneNamespace needs access to collect cloning data and apply config
    this.#clone.setCallbacks(
      // getCloneData: collect all data needed for cloning
      () => {
        const [canDeactivateFactories, canActivateFactories] =
          this.#routeLifecycle.getFactories();

        return {
          routes: this.#routes.cloneRoutes(),
          options: { ...this.#options.get() },
          dependencies: this.#dependencies.getAll(),
          canDeactivateFactories,
          canActivateFactories,
          middlewareFactories: this.#middleware.getFactories(),
          pluginFactories: this.#plugins.getAll(),
          routeConfig: this.#routes.getConfig(),
          resolvedForwardMap: this.#routes.getResolvedForwardMap(),
        };
      },
      // applyConfig: apply route config to new router
      (newRouter, config, resolvedForwardMap) => {
        // Access new router's internal config via type assertion
        // This is safe because we know the newRouter is a Router instance
        const typedRouter = newRouter as unknown as Router<Dependencies>;
        const newConfig = typedRouter.#routes.getConfig();

        Object.assign(newConfig.decoders, config.decoders);
        Object.assign(newConfig.encoders, config.encoders);
        Object.assign(newConfig.defaultParams, config.defaultParams);
        Object.assign(newConfig.forwardMap, config.forwardMap);

        typedRouter.#routes.setResolvedForwardMap({ ...resolvedForwardMap });
      },
    );
  }
}
