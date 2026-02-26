// packages/core/src/Router.ts
/* eslint-disable unicorn/prefer-event-target -- custom EventEmitter package, not Node.js EventEmitter */

/**
 * Router class - facade with integrated namespaces.
 *
 * All functionality is now provided by namespace classes.
 */

import { logger } from "@real-router/logger";
import { EventEmitter } from "event-emitter";
import { validateRouteName } from "type-guards";

import { errorCodes } from "./constants";
import { createRouterFSM } from "./fsm";
import { createLimits } from "./helpers";
import { getInternals, registerInternals } from "./internals";
import {
  DependenciesNamespace,
  EventBusNamespace,
  NavigationNamespace,
  OptionsNamespace,
  PluginsNamespace,
  RouteLifecycleNamespace,
  RouterLifecycleNamespace,
  RoutesNamespace,
  StateNamespace,
} from "./namespaces";
import { CACHED_ALREADY_STARTED_ERROR } from "./namespaces/RouterLifecycleNamespace/constants";
import {
  validateAddRouteArgs,
  validateBuildPathArgs,
  validateIsActiveRouteArgs,
  validateRoutes,
  validateShouldUpdateNodeArgs,
} from "./namespaces/RoutesNamespace/validators";
import { RouterError } from "./RouterError";
import { getTransitionPath } from "./transitionPath";
import { isLoggerConfig } from "./typeGuards";
import { RouterWiringBuilder, wireRouter } from "./wiring";

import type {
  GuardFnFactory,
  Limits,
  PluginFactory,
  Route,
  RouterEventMap,
} from "./types";
import type {
  DefaultDependencies,
  NavigationOptions,
  Options,
  Params,
  State,
  SubscribeFn,
  Unsubscribe,
} from "@real-router/types";
import type { CreateMatcherOptions } from "route-tree";

/**
 * Router class with integrated namespace architecture.
 *
 * All functionality is provided by namespace classes:
 * - OptionsNamespace: getOptions (immutable)
 * - DependenciesNamespace: get/set/remove dependencies
 * - EventEmitter: subscribe
 * - StateNamespace: state storage (getState, setState, getPreviousState)
 * - RoutesNamespace: route tree operations
 * - RouteLifecycleNamespace: canActivate/canDeactivate guards
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
  readonly #limits: Limits;
  readonly #dependencies: DependenciesNamespace<Dependencies>;
  readonly #state: StateNamespace;
  readonly #routes: RoutesNamespace<Dependencies>;
  readonly #routeLifecycle: RouteLifecycleNamespace<Dependencies>;
  readonly #plugins: PluginsNamespace<Dependencies>;
  readonly #navigation: NavigationNamespace;
  readonly #lifecycle: RouterLifecycleNamespace;

  readonly #eventBus: EventBusNamespace;

  /**
   * When true, skips argument validation in public methods for production performance.
   * Constructor options are always validated (needed to validate noValidate itself).
   */
  readonly #noValidate: boolean;

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

    // Always validate options (needed to validate noValidate itself)
    OptionsNamespace.validateOptions(options, "constructor");

    // Extract noValidate BEFORE creating namespaces
    const noValidate = options.noValidate ?? false;

    // Conditional validation for dependencies
    if (!noValidate) {
      DependenciesNamespace.validateDependenciesObject(
        dependencies,
        "constructor",
      );
    }

    // Conditional validation for initial routes - structure and batch duplicates
    // Validation happens BEFORE tree is built, so tree is not passed
    if (!noValidate && routes.length > 0) {
      validateAddRouteArgs(routes);
      validateRoutes(routes);
    }

    // =========================================================================
    // Create Namespaces
    // =========================================================================

    this.#options = new OptionsNamespace(options);
    this.#limits = createLimits(options.limits);
    this.#dependencies = new DependenciesNamespace<Dependencies>(dependencies);
    this.#state = new StateNamespace();
    this.#routes = new RoutesNamespace<Dependencies>(
      routes,
      noValidate,
      deriveMatcherOptions(this.#options.get()),
    );
    this.#routeLifecycle = new RouteLifecycleNamespace<Dependencies>();
    this.#plugins = new PluginsNamespace<Dependencies>();
    this.#navigation = new NavigationNamespace();
    this.#lifecycle = new RouterLifecycleNamespace();
    this.#noValidate = noValidate;

    // =========================================================================
    // Initialize EventBus
    // =========================================================================

    const routerFSM = createRouterFSM();
    const emitter = new EventEmitter<RouterEventMap>({
      onListenerError: (eventName, error) => {
        logger.error("Router", `Error in listener for ${eventName}:`, error);
      },
      onListenerWarn: (eventName, count) => {
        logger.warn(
          "router.addEventListener",
          `Event "${eventName}" has ${count} listeners — possible memory leak`,
        );
      },
    });

    this.#eventBus = new EventBusNamespace({ routerFSM, emitter });

    // =========================================================================
    // Wire Dependencies
    // =========================================================================

    wireRouter(
      new RouterWiringBuilder<Dependencies>({
        router: this,
        options: this.#options,
        limits: this.#limits,
        dependencies: this.#dependencies,
        state: this.#state,
        routes: this.#routes,
        routeLifecycle: this.#routeLifecycle,
        plugins: this.#plugins,
        navigation: this.#navigation,
        lifecycle: this.#lifecycle,
        eventBus: this.#eventBus,
      }),
    );

    // =========================================================================
    // Register Internals (WeakMap for plugin/infrastructure access)
    // =========================================================================

    registerInternals(this, {
      makeState: (name, params, path, meta, forceId) =>
        this.#state.makeState(name, params, path, meta, forceId),
      forwardState: (name, params) => this.#routes.forwardState(name, params),
      buildStateResolved: (name, params) =>
        this.#routes.buildStateResolved(name, params),
      matchPath: (path, matchOptions) =>
        this.#routes.matchPath(path, matchOptions),
      getOptions: () => this.#options.get(),
      navigateToState: (toState, fromState, opts) =>
        this.#navigation.navigateToState(toState, fromState, opts),
      addEventListener: (eventName, cb) =>
        this.#eventBus.addEventListener(eventName, cb),
      buildPath: (route, params) =>
        this.#routes.buildPath(route, params, this.#options.get()),
      setRootPath: (rootPath) => {
        this.#routes.setRootPath(rootPath);
      },
      getRootPath: () => this.#routes.getStore().rootPath,
      getTree: () => this.#routes.getStore().tree,
      isDisposed: () => this.#eventBus.isDisposed(),
      noValidate,
      // Dependencies (issue #172)
      dependencyGet: (key) => this.#dependencies.get(key as keyof Dependencies),
      dependencyGetAll: () =>
        this.#dependencies.getAll() as Record<string, unknown>,
      dependencySet: (name, value) =>
        this.#dependencies.set(
          name as keyof Dependencies & string,
          value as Dependencies[keyof Dependencies & string],
        ),
      dependencySetMultiple: (deps) => {
        this.#dependencies.setMultiple(deps as Partial<Dependencies>);
      },
      dependencyCount: () => this.#dependencies.count(),
      dependencyRemove: (name) => {
        this.#dependencies.remove(name as keyof Dependencies);
      },
      dependencyHas: (name) =>
        this.#dependencies.has(name as keyof Dependencies),
      dependencyReset: () => {
        this.#dependencies.reset();
      },
      maxDependencies: this.#limits.maxDependencies,
      // Clone support (issue #173)
      cloneOptions: () => ({ ...this.#options.get() }),
      cloneDependencies: () =>
        this.#dependencies.getAll() as Record<string, unknown>,
      getLifecycleFactories: () => this.#routeLifecycle.getFactories(),
      getPluginFactories: () => this.#plugins.getAll(),
      routeGetStore: () => this.#routes.getStore(),
      // Cross-namespace state (issue #174)
      getStateName: () => this.#state.get()?.name,
      isTransitioning: () => this.#eventBus.isTransitioning(),
      clearState: () => {
        this.#state.set(undefined);
      },
    });

    // =========================================================================
    // Bind Public Methods
    // =========================================================================
    // All public methods that access private fields must be bound to preserve
    // `this` context when methods are extracted as references.
    // See: https://github.com/tc39/proposal-bind-operator
    // =========================================================================

    // Path & State Building
    this.isActiveRoute = this.isActiveRoute.bind(this);
    this.buildPath = this.buildPath.bind(this);

    // State Management
    this.getState = this.getState.bind(this);
    this.getPreviousState = this.getPreviousState.bind(this);
    this.areStatesEqual = this.areStatesEqual.bind(this);
    this.shouldUpdateNode = this.shouldUpdateNode.bind(this);

    // Router Lifecycle
    this.isActive = this.isActive.bind(this);
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.dispose = this.dispose.bind(this);

    // Route Lifecycle (Guards)
    this.addActivateGuard = this.addActivateGuard.bind(this);
    this.addDeactivateGuard = this.addDeactivateGuard.bind(this);
    this.removeActivateGuard = this.removeActivateGuard.bind(this);
    this.removeDeactivateGuard = this.removeDeactivateGuard.bind(this);
    this.canNavigateTo = this.canNavigateTo.bind(this);

    // Plugins
    this.usePlugin = this.usePlugin.bind(this);

    // Navigation
    this.navigate = this.navigate.bind(this);
    this.navigateToDefault = this.navigateToDefault.bind(this);

    // Subscription
    this.subscribe = this.subscribe.bind(this);
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
    if (!this.#noValidate) {
      validateIsActiveRouteArgs(
        name,
        params,
        strictEquality,
        ignoreQueryParams,
      );
    }

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
    if (!this.#noValidate) {
      validateBuildPathArgs(route);
    }

    return this.#routes.buildPath(route, params, this.#options.get());
  }

  // ============================================================================
  // State Management (delegated to StateNamespace)
  // ============================================================================

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
    if (!this.#noValidate) {
      StateNamespace.validateAreStatesEqualArgs(
        state1,
        state2,
        ignoreQueryParams,
      );
    }

    return this.#state.areStatesEqual(state1, state2, ignoreQueryParams);
  }

  shouldUpdateNode(
    nodeName: string,
  ): (toState: State, fromState?: State) => boolean {
    if (!this.#noValidate) {
      validateShouldUpdateNodeArgs(nodeName);
    }

    return RoutesNamespace.shouldUpdateNode(nodeName);
  }

  // ============================================================================
  // Router Lifecycle
  // ============================================================================

  isActive(): boolean {
    return this.#eventBus.isActive();
  }

  async start(startPath: string): Promise<State> {
    // Static validation
    if (!this.#noValidate) {
      RouterLifecycleNamespace.validateStartArgs([startPath]);
    }

    if (!this.#eventBus.canStart()) {
      throw CACHED_ALREADY_STARTED_ERROR;
    }

    this.#eventBus.sendStart();

    try {
      return await this.#lifecycle.start(startPath);
    } catch (error) {
      if (this.#eventBus.isReady()) {
        this.#lifecycle.stop();
        this.#eventBus.sendStop();
      }

      throw error;
    }
  }

  stop(): this {
    this.#eventBus.cancelTransitionIfRunning(this.#state.get());

    if (!this.#eventBus.isReady() && !this.#eventBus.isTransitioning()) {
      return this;
    }

    this.#lifecycle.stop();
    this.#eventBus.sendStop();

    return this;
  }

  dispose(): void {
    if (this.#eventBus.isDisposed()) {
      return;
    }

    this.#eventBus.cancelTransitionIfRunning(this.#state.get());

    if (this.#eventBus.isReady() || this.#eventBus.isTransitioning()) {
      this.#lifecycle.stop();
      this.#eventBus.sendStop();
    }

    this.#eventBus.sendDispose();
    this.#eventBus.clearAll();

    this.#plugins.disposeAll();
    this.#routes.clearRoutes();
    this.#routeLifecycle.clearAll();
    this.#state.reset();
    this.#dependencies.reset();

    this.#markDisposed();
  }

  // ============================================================================
  // Route Lifecycle (Guards)
  // ============================================================================

  addDeactivateGuard(
    name: string,
    canDeactivateHandler: GuardFnFactory<Dependencies> | boolean,
  ): this {
    if (!this.#noValidate) {
      validateRouteName(name, "addDeactivateGuard");
      RouteLifecycleNamespace.validateHandler(
        canDeactivateHandler,
        "addDeactivateGuard",
      );
    }

    this.#routeLifecycle.addCanDeactivate(
      name,
      canDeactivateHandler,
      this.#noValidate,
    );

    return this;
  }

  addActivateGuard(
    name: string,
    canActivateHandler: GuardFnFactory<Dependencies> | boolean,
  ): this {
    if (!this.#noValidate) {
      validateRouteName(name, "addActivateGuard");
      RouteLifecycleNamespace.validateHandler(
        canActivateHandler,
        "addActivateGuard",
      );
    }

    this.#routeLifecycle.addCanActivate(
      name,
      canActivateHandler,
      this.#noValidate,
    );

    return this;
  }

  removeActivateGuard(name: string): void {
    if (!this.#noValidate) {
      validateRouteName(name, "removeActivateGuard");
    }

    this.#routeLifecycle.clearCanActivate(name);
  }

  removeDeactivateGuard(name: string): void {
    if (!this.#noValidate) {
      validateRouteName(name, "removeDeactivateGuard");
    }

    this.#routeLifecycle.clearCanDeactivate(name);
  }

  canNavigateTo(name: string, params?: Params): boolean {
    if (!this.#noValidate) {
      validateRouteName(name, "canNavigateTo");
    }

    if (!this.#routes.hasRoute(name)) {
      return false;
    }

    const ctx = getInternals(this);
    const { name: resolvedName, params: resolvedParams } = ctx.forwardState(
      name,
      params ?? {},
    );
    const toState = this.#state.makeState(resolvedName, resolvedParams);
    const fromState = this.#state.get();

    const { toDeactivate, toActivate } = getTransitionPath(toState, fromState);

    for (const segment of toDeactivate) {
      if (
        !this.#routeLifecycle.checkDeactivateGuardSync(
          segment,
          toState,
          fromState,
        )
      ) {
        return false;
      }
    }

    for (const segment of toActivate) {
      if (
        !this.#routeLifecycle.checkActivateGuardSync(
          segment,
          toState,
          fromState,
        )
      ) {
        return false;
      }
    }

    return true;
  }

  // ============================================================================
  // Plugins
  // ============================================================================

  usePlugin(...plugins: PluginFactory<Dependencies>[]): Unsubscribe {
    if (!this.#noValidate) {
      // 1. Validate input arguments
      PluginsNamespace.validateUsePluginArgs<Dependencies>(plugins);

      // 2. Validate limit
      PluginsNamespace.validatePluginLimit(
        this.#plugins.count(),
        plugins.length,
        this.#limits.maxPlugins,
      );

      // 3. Validate no duplicates with existing plugins
      PluginsNamespace.validateNoDuplicatePlugins(
        plugins,
        this.#plugins.has.bind(this.#plugins),
      );
    }

    // 4. Execute (warnings, deduplication, initialization, commit)
    return this.#plugins.use(...plugins);
  }

  // ============================================================================
  // Subscription (backed by EventEmitter)
  // ============================================================================

  subscribe(listener: SubscribeFn): Unsubscribe {
    if (!this.#noValidate) {
      EventBusNamespace.validateSubscribeListener(listener);
    }

    return this.#eventBus.subscribe(listener);
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  navigate(
    routeName: string,
    routeParams?: Params,
    options?: NavigationOptions,
  ): Promise<State> {
    // 1. Validate route name
    if (!this.#noValidate) {
      NavigationNamespace.validateNavigateArgs(routeName);
    }

    // 2. Validate parsed options
    const opts = options ?? {};

    if (!this.#noValidate) {
      NavigationNamespace.validateNavigationOptions(opts, "navigate");
    }

    // 3. Execute navigation with parsed arguments
    const promiseState = this.#navigation.navigate(
      routeName,
      routeParams ?? {},
      opts,
    );

    Router.#suppressUnhandledRejection(promiseState);

    return promiseState;
  }

  navigateToDefault(): Promise<State>;
  navigateToDefault(options: NavigationOptions): Promise<State>;
  navigateToDefault(options?: NavigationOptions): Promise<State> {
    // 1. Validate arguments
    if (!this.#noValidate) {
      NavigationNamespace.validateNavigateToDefaultArgs(options);
    }

    // 2. Validate parsed options
    const opts = options ?? {};

    if (!this.#noValidate) {
      NavigationNamespace.validateNavigationOptions(opts, "navigateToDefault");
    }

    // 3. Execute navigation with parsed arguments
    const promiseState = this.#navigation.navigateToDefault(opts);

    Router.#suppressUnhandledRejection(promiseState);

    return promiseState;
  }

  /**
   * Pre-allocated callback for #suppressUnhandledRejection.
   * Avoids creating a new closure on every navigate() call.
   */
  static readonly #onSuppressedError = (error: unknown): void => {
    if (
      error instanceof RouterError &&
      (error.code === errorCodes.SAME_STATES ||
        error.code === errorCodes.TRANSITION_CANCELLED ||
        error.code === errorCodes.ROUTER_NOT_STARTED ||
        error.code === errorCodes.ROUTE_NOT_FOUND)
    ) {
      return;
    }

    logger.error("router.navigate", "Unexpected navigation error", error);
  };

  /**
   * Fire-and-forget safety: prevents unhandled rejection warnings
   * when navigate/navigateToDefault is called without await.
   * Expected errors are silently suppressed; unexpected ones are logged.
   */
  static #suppressUnhandledRejection(promise: Promise<State>): void {
    promise.catch(Router.#onSuppressedError);
  }

  #markDisposed(): void {
    this.navigate = throwDisposed as never;
    this.navigateToDefault = throwDisposed as never;
    this.start = throwDisposed as never;
    this.stop = throwDisposed as never;
    this.addActivateGuard = throwDisposed as never;
    this.addDeactivateGuard = throwDisposed as never;
    this.removeActivateGuard = throwDisposed as never;
    this.removeDeactivateGuard = throwDisposed as never;
    this.usePlugin = throwDisposed as never;

    this.subscribe = throwDisposed as never;
    this.canNavigateTo = throwDisposed as never;
  }
}

function throwDisposed(): never {
  throw new RouterError(errorCodes.ROUTER_DISPOSED);
}

/**
 * Derives CreateMatcherOptions from router Options.
 * Maps core option names to matcher option names.
 */
function deriveMatcherOptions(
  options: Readonly<Options>,
): CreateMatcherOptions {
  return {
    strictTrailingSlash: options.trailingSlash === "strict",
    strictQueryParams: options.queryParamsMode === "strict",
    urlParamsEncoding: options.urlParamsEncoding,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    queryParams: options.queryParams!,
  };
}
