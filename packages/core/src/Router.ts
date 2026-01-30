// packages/core/src/Router.ts

/**
 * Router class - facade with integrated namespaces.
 *
 * All functionality is now provided by namespace classes.
 */

import { logger } from "@real-router/logger";
import { validateRouteName } from "type-guards";

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

import type { EventMethodMap } from "./namespaces";
import type { MiddlewareDependencies } from "./namespaces/MiddlewareNamespace";
import type {
  NavigationDependencies,
  TransitionDependencies,
} from "./namespaces/NavigationNamespace";
import type { RouterObservable } from "./namespaces/ObservableNamespace";
import type { PluginsDependencies } from "./namespaces/PluginsNamespace";
import type { RouteLifecycleDependencies } from "./namespaces/RouteLifecycleNamespace";
import type { RouterLifecycleDependencies } from "./namespaces/RouterLifecycleNamespace";
import type { RoutesDependencies } from "./namespaces/RoutesNamespace";
import type {
  ActivationFnFactory,
  MiddlewareFactory,
  PluginFactory,
  Route,
  RouteConfigUpdate,
} from "./types";
import type {
  CancelFn,
  DefaultDependencies,
  DoneFn,
  EventName,
  NavigationOptions,
  Options,
  Params,
  Plugin,
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
> {
  // Index signatures to satisfy interface
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
  readonly #navigation: NavigationNamespace;
  readonly #lifecycle: RouterLifecycleNamespace;
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
    this.#navigation = new NavigationNamespace();
    this.#lifecycle = new RouterLifecycleNamespace();
    this.#clone = new CloneNamespace<Dependencies>();

    // =========================================================================
    // Setup Dependencies
    // =========================================================================

    this.#setupDependencies();

    // =========================================================================
    // Bind Public Methods
    // =========================================================================
    // All public methods that access private fields must be bound to preserve
    // `this` context when methods are extracted as references.
    // See: https://github.com/nicolo-ribaudo/tc39-proposal-bind-operator
    // =========================================================================

    // Route Management
    this.addRoute = this.addRoute.bind(this);
    this.removeRoute = this.removeRoute.bind(this);
    this.clearRoutes = this.clearRoutes.bind(this);
    this.getRoute = this.getRoute.bind(this);
    this.hasRoute = this.hasRoute.bind(this);
    this.updateRoute = this.updateRoute.bind(this);

    // Path & State Building
    this.isActiveRoute = this.isActiveRoute.bind(this);
    this.buildPath = this.buildPath.bind(this);
    this.matchPath = this.matchPath.bind(this);
    this.setRootPath = this.setRootPath.bind(this);
    this.getRootPath = this.getRootPath.bind(this);

    // State Management
    this.makeState = this.makeState.bind(this);
    this.getState = this.getState.bind(this);
    this.getPreviousState = this.getPreviousState.bind(this);
    this.areStatesEqual = this.areStatesEqual.bind(this);
    this.forwardState = this.forwardState.bind(this);
    this.buildState = this.buildState.bind(this);
    this.shouldUpdateNode = this.shouldUpdateNode.bind(this);

    // Options
    this.getOptions = this.getOptions.bind(this);
    this.getOption = this.getOption.bind(this);
    this.setOption = this.setOption.bind(this);

    // Router Lifecycle
    this.isActive = this.isActive.bind(this);
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);

    // Route Lifecycle (Guards)
    this.canDeactivate = this.canDeactivate.bind(this);
    this.canActivate = this.canActivate.bind(this);

    // Plugins
    this.usePlugin = this.usePlugin.bind(this);

    // Middleware
    this.useMiddleware = this.useMiddleware.bind(this);
    this.clearMiddleware = this.clearMiddleware.bind(this);

    // Dependencies
    this.setDependency = this.setDependency.bind(this);
    this.setDependencies = this.setDependencies.bind(this);
    this.getDependency = this.getDependency.bind(this);
    this.getDependencies = this.getDependencies.bind(this);
    this.removeDependency = this.removeDependency.bind(this);
    this.hasDependency = this.hasDependency.bind(this);
    this.resetDependencies = this.resetDependencies.bind(this);

    // Events
    this.addEventListener = this.addEventListener.bind(this);

    // Navigation
    this.navigate = this.navigate.bind(this);
    this.navigateToDefault = this.navigateToDefault.bind(this);
    this.navigateToState = this.navigateToState.bind(this);

    // Subscription
    this.subscribe = this.subscribe.bind(this);

    // Cloning
    this.clone = this.clone.bind(this);
  }

  // ============================================================================
  // Route Management
  // ============================================================================

  addRoute(routes: Route<Dependencies>[] | Route<Dependencies>): this {
    const routeArray = Array.isArray(routes) ? routes : [routes];

    // 1. Static validation (route structure and properties)
    RoutesNamespace.validateAddRouteArgs(routeArray);

    // 2. State-dependent validation (duplicates, parent exists, forwardTo)
    RoutesNamespace.validateRoutes(
      routeArray,
      this.#routes.getTree(),
      this.#routes.getForwardRecord(),
    );

    // 3. Execute (add definitions, register handlers, rebuild tree)
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
    // Use facade method for proper validation
    if (canActivate !== undefined) {
      if (canActivate === null) {
        this.#routeLifecycle.clearCanActivate(name, true);
      } else {
        this.canActivate(name, canActivate);
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

  getState<P extends Params = Params, MP extends Params = Params>():
    | State<P, MP>
    | undefined {
    return this.#state.get<P, MP>();
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

    // Call forwardState at facade level to allow plugin interception
    const { name, params } = this.forwardState(routeName, routeParams);

    return this.#routes.buildStateResolved(name, params);
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
    OptionsNamespace.validateOptionExists(option, "getOption");

    return this.#options.getOption(option);
  }

  setOption(option: keyof Options, value: Options[keyof Options]): this {
    OptionsNamespace.validateOptionName(option, "setOption");
    OptionsNamespace.validateOptionExists(option, "setOption");
    OptionsNamespace.validateNotLocked(this.#options.isLocked(), option);
    OptionsNamespace.validateOptionValue(option, value, "setOption");
    this.#options.set(option, value);

    return this;
  }

  // ============================================================================
  // Router Lifecycle
  // ============================================================================

  isActive(): boolean {
    return this.#lifecycle.isActive();
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
    // 1. Validate input
    validateRouteName(name, "canDeactivate");
    RouteLifecycleNamespace.validateHandler(
      canDeactivateHandler,
      "canDeactivate",
    );

    // 2. Validate not registering
    RouteLifecycleNamespace.validateNotRegistering(
      this.#routeLifecycle.isRegistering(name),
      name,
      "canDeactivate",
    );

    // 3. Check if overwrite and validate limit
    const isOverwrite = this.#routeLifecycle.hasCanDeactivate(name);

    if (!isOverwrite) {
      RouteLifecycleNamespace.validateHandlerLimit(
        this.#routeLifecycle.countCanDeactivate() + 1,
        "canDeactivate",
      );
    }

    // 4. Execute
    this.#routeLifecycle.registerCanDeactivate(
      name,
      canDeactivateHandler,
      isOverwrite,
    );

    return this;
  }

  canActivate(
    name: string,
    canActivateHandler: ActivationFnFactory<Dependencies> | boolean,
  ): this {
    // 1. Validate input
    validateRouteName(name, "canActivate");
    RouteLifecycleNamespace.validateHandler(canActivateHandler, "canActivate");

    // 2. Validate not registering
    RouteLifecycleNamespace.validateNotRegistering(
      this.#routeLifecycle.isRegistering(name),
      name,
      "canActivate",
    );

    // 3. Check if overwrite and validate limit
    const isOverwrite = this.#routeLifecycle.hasCanActivate(name);

    if (!isOverwrite) {
      RouteLifecycleNamespace.validateHandlerLimit(
        this.#routeLifecycle.countCanActivate() + 1,
        "canActivate",
      );
    }

    // 4. Execute
    this.#routeLifecycle.registerCanActivate(
      name,
      canActivateHandler,
      isOverwrite,
    );

    return this;
  }

  // ============================================================================
  // Plugins
  // ============================================================================

  usePlugin(...plugins: PluginFactory<Dependencies>[]): Unsubscribe {
    // 1. Validate input arguments
    PluginsNamespace.validateUsePluginArgs<Dependencies>(plugins);

    // 2. Validate limit
    PluginsNamespace.validatePluginLimit(this.#plugins.count(), plugins.length);

    // 3. Validate no duplicates with existing plugins
    PluginsNamespace.validateNoDuplicatePlugins(
      plugins,
      this.#plugins.getAll(),
    );

    // 4. Execute (warnings, deduplication, initialization, commit)
    return this.#plugins.use(...plugins);
  }

  // ============================================================================
  // Middleware
  // ============================================================================

  useMiddleware(
    ...middlewares: MiddlewareFactory<Dependencies>[]
  ): Unsubscribe {
    // 1. Validate input arguments
    MiddlewareNamespace.validateUseMiddlewareArgs<Dependencies>(middlewares);

    // 2. Validate no duplicates
    MiddlewareNamespace.validateNoDuplicates<Dependencies>(
      middlewares,
      this.#middleware.getFactories(),
    );

    // 3. Validate limit
    MiddlewareNamespace.validateMiddlewareLimit(
      this.#middleware.count(),
      middlewares.length,
    );

    // 4. Initialize (without committing)
    const initialized = this.#middleware.initialize(...middlewares);

    // 5. Validate results
    for (const { middleware, factory } of initialized) {
      MiddlewareNamespace.validateMiddleware<Dependencies>(middleware, factory);
    }

    // 6. Commit
    return this.#middleware.commit(initialized);
  }

  clearMiddleware(): this {
    this.#middleware.clear();

    return this;
  }

  // ============================================================================
  // Dependencies (backed by DependenciesNamespace)
  // ============================================================================

  setDependency<K extends keyof Dependencies & string>(
    dependencyName: K,
    dependency: Dependencies[K],
  ): this {
    DependenciesNamespace.validateSetDependencyArgs(dependencyName);
    this.#dependencies.set(dependencyName, dependency);

    return this;
  }

  setDependencies(deps: Dependencies): this {
    DependenciesNamespace.validateDependenciesObject(deps, "setDependencies");
    DependenciesNamespace.validateDependencyLimit(
      this.#dependencies.count(),
      Object.keys(deps).length,
      "setDependencies",
    );
    this.#dependencies.setMultiple(deps);

    return this;
  }

  getDependency<K extends keyof Dependencies>(key: K): Dependencies[K] {
    DependenciesNamespace.validateName(key, "getDependency");

    const value = this.#dependencies.get(key);

    DependenciesNamespace.validateDependencyExists(value, key);

    return value;
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

  addEventListener<E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ): Unsubscribe {
    ObservableNamespace.validateListenerArgs(eventName, cb);

    return this.#observable.addEventListener(eventName, cb);
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  navigate(
    routeName: string,
    routeParamsOrDone?: Params | DoneFn,
    optionsOrDone?: NavigationOptions | DoneFn,
    done?: DoneFn,
  ): CancelFn {
    // 1. Validate route name
    NavigationNamespace.validateNavigateArgs(routeName);

    // 2. Parse polymorphic arguments
    const { params, opts, callback } = NavigationNamespace.parseNavigateArgs(
      routeParamsOrDone,
      optionsOrDone,
      done,
    );

    // 3. Validate parsed options
    NavigationNamespace.validateNavigationOptions(opts, "navigate");

    // 4. Execute navigation with parsed arguments
    return this.#navigation.navigate(routeName, params, opts, callback);
  }

  navigateToDefault(
    optsOrDone?: NavigationOptions | DoneFn,
    done?: DoneFn,
  ): CancelFn {
    // 1. Validate arguments (before parsing)
    NavigationNamespace.validateNavigateToDefaultArgs(optsOrDone, done);

    // 2. Parse polymorphic arguments
    const { opts, callback } = NavigationNamespace.parseNavigateToDefaultArgs(
      optsOrDone,
      done,
    );

    // 3. Validate parsed options
    NavigationNamespace.validateNavigationOptions(opts, "navigateToDefault");

    // 4. Execute navigation with parsed arguments
    return this.#navigation.navigateToDefault(opts, callback);
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

  clone(dependencies?: Dependencies): Router<Dependencies> {
    CloneNamespace.validateCloneArgs(dependencies);

    return this.#clone.clone(
      dependencies,
      (routes, options, deps) =>
        new Router<Dependencies>(routes, options, deps),
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
    // RouteLifecycleNamespace must be set up FIRST because RoutesNamespace.setDependencies()
    // will register pending canActivate handlers which need RouteLifecycleNamespace
    this.#routeLifecycle.setRouter(this);

    // RouteLifecycleNamespace uses function injection for getDependency
    const routeLifecycleDeps: RouteLifecycleDependencies<Dependencies> = {
      getDependency: <K extends keyof Dependencies>(dependencyName: K) =>
        this.#dependencies.get(dependencyName),
    };

    this.#routeLifecycle.setDependencies(routeLifecycleDeps);

    // RoutesNamespace uses function injection (will register pending canActivate handlers)
    // Use facade method for proper validation
    const routesDeps: RoutesDependencies<Dependencies> = {
      canActivate: (name, handler) => {
        this.canActivate(name, handler);
      },
      makeState: (name, params, path, meta) =>
        this.#state.makeState(name, params, path, meta),
      getState: () => this.#state.get(),
      areStatesEqual: (state1, state2, ignoreQueryParams) =>
        this.#state.areStatesEqual(state1, state2, ignoreQueryParams),
    };

    this.#routes.setDependencies(routesDeps);
    this.#routes.setLifecycleNamespace(this.#routeLifecycle);

    this.#middleware.setRouter(this);

    // MiddlewareNamespace uses function injection for getDependency
    const middlewareDeps: MiddlewareDependencies<Dependencies> = {
      getDependency: <K extends keyof Dependencies>(dependencyName: K) =>
        this.#dependencies.get(dependencyName),
    };

    this.#middleware.setDependencies(middlewareDeps);

    this.#plugins.setRouter(this);

    // PluginsNamespace uses function injection for internal @internal method calls
    const pluginsDeps: PluginsDependencies<Dependencies> = {
      addEventListener: (eventName, cb) =>
        this.#observable.addEventListener(eventName, cb),
      isStarted: () => this.#lifecycle.isStarted(),
      getDependency: <K extends keyof Dependencies>(dependencyName: K) =>
        this.#dependencies.get(dependencyName),
    };

    this.#plugins.setDependencies(pluginsDeps);

    // NavigationNamespace uses function injection
    const navigationDeps: NavigationDependencies = {
      getOptions: () => this.#options.get(),
      hasRoute: (name) => this.#routes.hasRoute(name),
      getState: () => this.#state.get(),
      setState: (state) => {
        this.#state.set(state);
      },
      buildStateWithSegments: (routeName, routeParams) => {
        // Validation must happen here since we bypass the facade method
        RoutesNamespace.validateStateBuilderArgs(
          routeName,
          routeParams,
          "buildStateWithSegments",
        );

        // Call forwardState to allow plugin interception
        const { name, params } = this.forwardState(routeName, routeParams);

        return this.#routes.buildStateWithSegmentsResolved(name, params);
      },
      makeState: (name, params, path, meta) =>
        this.#state.makeState(name, params, path, meta),
      buildPath: (route, params) => this.buildPath(route, params),
      areStatesEqual: (state1, state2, ignoreQueryParams) =>
        this.#state.areStatesEqual(state1, state2, ignoreQueryParams),
      invokeEventListeners: (eventName, toState, fromState, arg) => {
        this.#observable.invoke(eventName, toState, fromState, arg);
      },
    };

    this.#navigation.setDependencies(navigationDeps);

    const transitionDeps: TransitionDependencies = {
      getLifecycleFunctions: () => this.#routeLifecycle.getFunctions(),
      getMiddlewareFunctions: () => this.#middleware.getFunctions(),
      isActive: () => this.#lifecycle.isActive(),
      clearCanDeactivate: (name) => {
        this.#routeLifecycle.clearCanDeactivate(name);
      },
    };

    this.#navigation.setTransitionDependencies(transitionDeps);

    // RouterLifecycleNamespace uses function injection
    // Use facade methods to ensure spies work and plugin interception is possible
    const lifecycleDeps: RouterLifecycleDependencies = {
      getOptions: () => this.#options.get(),
      hasListeners: (eventName) => this.#observable.hasListeners(eventName),
      invokeEventListeners: (eventName, toState, fromState, arg) => {
        this.#observable.invoke(eventName, toState, fromState, arg);
      },
      buildState: (routeName, routeParams) =>
        this.buildState(routeName, routeParams),
      makeState: (name, params, path, meta) =>
        this.#state.makeState(name, params, path, meta),
      buildPath: (route, params) => this.buildPath(route, params),
      makeNotFoundState: (path, options) =>
        this.#state.makeNotFoundState(path, options),
      setState: (state) => {
        this.#state.set(state);
      },
      // RouterLifecycleNamespace only uses matchPath without source parameter
      matchPath: (path, source?: string) =>
        this.#routes.matchPath(path, source, this.#options.get()),
    };

    this.#lifecycle.setDependencies(lifecycleDeps);

    // Observable needs access to state for replay feature
    this.#observable.setGetState(() => this.#state.get());

    // StateNamespace needs access to route config and path building
    this.#state.setDependencies({
      getDefaultParams: () => this.#routes.getConfig().defaultParams,
      buildPath: (name, params) =>
        this.#routes.buildPath(name, params, this.#options.get()),
      getUrlParams: (name) => this.#routes.getUrlParams(name),
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
    ) =>
      this.#navigation.navigateToState(
        toState,
        fromState,
        opts,
        callback,
        emitSuccess,
      );

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
