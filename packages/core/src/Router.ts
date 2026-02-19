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

import { errorCodes, events } from "./constants";
import {
  validateListenerArgs,
  validateSubscribeListener,
} from "./eventValidation";
import { createRouterFSM, routerEvents, routerStates } from "./fsm";
import { createLimits } from "./helpers";
import {
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
} from "./namespaces";
import { CACHED_ALREADY_STARTED_ERROR } from "./namespaces/RouterLifecycleNamespace/constants";
import { RouterError } from "./RouterError";
import { getTransitionPath } from "./transitionPath";
import { isLoggerConfig } from "./typeGuards";

import type { RouterEvent, RouterPayloads, RouterState } from "./fsm";
import type { MiddlewareDependencies } from "./namespaces/MiddlewareNamespace";
import type {
  NavigationDependencies,
  TransitionDependencies,
} from "./namespaces/NavigationNamespace";
import type { PluginsDependencies } from "./namespaces/PluginsNamespace";
import type { RouteLifecycleDependencies } from "./namespaces/RouteLifecycleNamespace";
import type { RouterLifecycleDependencies } from "./namespaces/RouterLifecycleNamespace";
import type { RoutesDependencies } from "./namespaces/RoutesNamespace";
import type {
  ActivationFnFactory,
  EventMethodMap,
  Limits,
  MiddlewareFactory,
  PluginFactory,
  Route,
  RouteConfigUpdate,
  RouterEventMap,
} from "./types";
import type { FSM } from "@real-router/fsm";
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
 * - EventEmitter: event listeners, subscribe
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
  readonly #limits: Limits;
  readonly #dependencies: DependenciesNamespace<Dependencies>;
  readonly #state: StateNamespace;
  readonly #routes: RoutesNamespace<Dependencies>;
  readonly #routeLifecycle: RouteLifecycleNamespace<Dependencies>;
  readonly #middleware: MiddlewareNamespace<Dependencies>;
  readonly #plugins: PluginsNamespace<Dependencies>;
  readonly #navigation: NavigationNamespace;
  readonly #lifecycle: RouterLifecycleNamespace;
  readonly #clone: CloneNamespace<Dependencies>;

  readonly #routerFSM: FSM<RouterState, RouterEvent, null, RouterPayloads>;
  readonly #emitter: EventEmitter<RouterEventMap>;

  /**
   * When true, skips argument validation in public methods for production performance.
   * Constructor options are always validated (needed to validate noValidate itself).
   */
  readonly #noValidate: boolean;

  /**
   * Current target state for transition (stored for dependency injection).
   * Used by startTransition to pass toState to routerFSM.
   */
  #currentToState: State | undefined;

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
      RoutesNamespace.validateAddRouteArgs(routes);
      RoutesNamespace.validateRoutes(routes);
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
    this.#middleware = new MiddlewareNamespace<Dependencies>();
    this.#plugins = new PluginsNamespace<Dependencies>();
    this.#navigation = new NavigationNamespace();
    this.#lifecycle = new RouterLifecycleNamespace();
    this.#clone = new CloneNamespace<Dependencies>();
    this.#noValidate = noValidate;

    // =========================================================================
    // Initialize FSMs
    // =========================================================================

    this.#routerFSM = createRouterFSM();
    this.#emitter = new EventEmitter<RouterEventMap>({
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
    this.buildNavigationState = this.buildNavigationState.bind(this);
    this.shouldUpdateNode = this.shouldUpdateNode.bind(this);

    // Options
    this.getOptions = this.getOptions.bind(this);

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

    // Middleware
    this.useMiddleware = this.useMiddleware.bind(this);
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

  addRoute(
    routes: Route<Dependencies>[] | Route<Dependencies>,
    options?: { parent?: string },
  ): this {
    const routeArray = Array.isArray(routes) ? routes : [routes];
    const parentName = options?.parent;

    if (!this.#noValidate) {
      // 1. Validate parent option format
      if (parentName !== undefined) {
        RoutesNamespace.validateParentOption(parentName);
      }

      // 2. Static validation (route structure and properties)
      RoutesNamespace.validateAddRouteArgs(routeArray);

      // 3. State-dependent validation (parent exists, duplicates, forwardTo)
      RoutesNamespace.validateRoutes(
        routeArray,
        this.#routes.getTree(),
        this.#routes.getForwardRecord(),
        parentName,
      );
    }

    // 4. Execute (add definitions, register handlers, rebuild tree)
    this.#routes.addRoutes(routeArray, parentName);

    return this;
  }

  removeRoute(name: string): this {
    // Static validation
    if (!this.#noValidate) {
      RoutesNamespace.validateRemoveRouteArgs(name);
    }

    // Instance validation (checks active route, navigation state)
    const canRemove = this.#routes.validateRemoveRoute(
      name,
      this.#state.get()?.name,
      this.#routerFSM.getState() === routerStates.TRANSITIONING,
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
    const isNavigating =
      this.#routerFSM.getState() === routerStates.TRANSITIONING;

    // Validate operation can proceed
    const canClear = this.#routes.validateClearRoutes(isNavigating);

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
    if (!this.#noValidate) {
      validateRouteName(name, "getRoute");
    }

    return this.#routes.getRoute(name);
  }

  hasRoute(name: string): boolean {
    if (!this.#noValidate) {
      validateRouteName(name, "hasRoute");
    }

    return this.#routes.hasRoute(name);
  }

  updateRoute(name: string, updates: RouteConfigUpdate<Dependencies>): this {
    // Validate name and updates object structure (basic checks only)
    if (!this.#noValidate) {
      RoutesNamespace.validateUpdateRouteBasicArgs(name, updates);
    }

    // Cache all property values upfront to protect against mutating getters.
    // This ensures consistent behavior regardless of getter side effects.
    // Must happen AFTER basic validation but BEFORE property type validation.
    const {
      forwardTo,
      defaultParams,
      decodeParams,
      encodeParams,
      canActivate,
      canDeactivate,
    } = updates;

    // Validate cached property values
    if (!this.#noValidate) {
      RoutesNamespace.validateUpdateRoutePropertyTypes(
        forwardTo,
        defaultParams,
        decodeParams,
        encodeParams,
      );
    }

    // Warn if navigation is in progress
    if (this.#routerFSM.getState() === routerStates.TRANSITIONING) {
      logger.error(
        "router.updateRoute",
        `Updating route "${name}" while navigation is in progress. This may cause unexpected behavior.`,
      );
    }

    // Instance validation (route existence, forwardTo checks) - use cached values
    if (!this.#noValidate) {
      this.#routes.validateUpdateRoute(name, forwardTo);
    }

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
        this.#routeLifecycle.clearCanActivate(name);
      } else {
        this.addActivateGuard(name, canActivate);
      }
    }

    // Handle canDeactivate separately (uses RouteLifecycleNamespace)
    // Use facade method for proper validation
    if (canDeactivate !== undefined) {
      if (canDeactivate === null) {
        this.#routeLifecycle.clearCanDeactivate(name);
      } else {
        this.addDeactivateGuard(name, canDeactivate);
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
    if (!this.#noValidate) {
      RoutesNamespace.validateIsActiveRouteArgs(
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
      RoutesNamespace.validateBuildPathArgs(route);
    }

    return this.#routes.buildPath(route, params, this.#options.get());
  }

  matchPath<P extends Params = Params, MP extends Params = Params>(
    path: string,
    source?: string,
  ): State<P, MP> | undefined {
    if (!this.#noValidate) {
      RoutesNamespace.validateMatchPathArgs(path);
    }

    return this.#routes.matchPath<P, MP>(path, source, this.#options.get());
  }

  setRootPath(rootPath: string): void {
    if (!this.#noValidate) {
      RoutesNamespace.validateSetRootPathArgs(rootPath);
    }

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
    if (!this.#noValidate) {
      StateNamespace.validateMakeStateArgs(name, params, path, forceId);
    }

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
    if (!this.#noValidate) {
      StateNamespace.validateAreStatesEqualArgs(
        state1,
        state2,
        ignoreQueryParams,
      );
    }

    return this.#state.areStatesEqual(state1, state2, ignoreQueryParams);
  }

  forwardState<P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ): SimpleState<P> {
    if (!this.#noValidate) {
      RoutesNamespace.validateStateBuilderArgs(
        routeName,
        routeParams,
        "forwardState",
      );
    }

    return this.#routes.forwardState<P>(routeName, routeParams);
  }

  buildState(
    routeName: string,
    routeParams: Params,
  ): RouteTreeState | undefined {
    if (!this.#noValidate) {
      RoutesNamespace.validateStateBuilderArgs(
        routeName,
        routeParams,
        "buildState",
      );
    }

    // Call forwardState at facade level to allow plugin interception
    const { name, params } = this.forwardState(routeName, routeParams);

    return this.#routes.buildStateResolved(name, params);
  }

  buildNavigationState(name: string, params: Params = {}): State | undefined {
    if (!this.#noValidate) {
      RoutesNamespace.validateStateBuilderArgs(
        name,
        params,
        "buildNavigationState",
      );
    }

    const routeInfo = this.buildState(name, params);

    if (!routeInfo) {
      return undefined;
    }

    return this.makeState(
      routeInfo.name,
      routeInfo.params,
      this.buildPath(routeInfo.name, routeInfo.params),
      {
        params: routeInfo.meta,
        options: {},
        redirected: false,
      },
    );
  }

  shouldUpdateNode(
    nodeName: string,
  ): (toState: State, fromState?: State) => boolean {
    if (!this.#noValidate) {
      RoutesNamespace.validateShouldUpdateNodeArgs(nodeName);
    }

    return this.#routes.shouldUpdateNode(nodeName);
  }

  // ============================================================================
  // Options (backed by OptionsNamespace)
  // ============================================================================

  getOptions(): Options {
    return this.#options.get();
  }

  // ============================================================================
  // Router Lifecycle
  // ============================================================================

  isActive(): boolean {
    const s = this.#routerFSM.getState();

    return s !== routerStates.IDLE && s !== routerStates.DISPOSED;
  }

  async start(startPath: string): Promise<State> {
    // Static validation
    if (!this.#noValidate) {
      RouterLifecycleNamespace.validateStartArgs([startPath]);
    }

    if (!this.#routerFSM.canSend(routerEvents.START)) {
      throw CACHED_ALREADY_STARTED_ERROR;
    }

    this.#routerFSM.send(routerEvents.START);

    try {
      return await this.#lifecycle.start(startPath);
    } catch (error) {
      if (this.#routerFSM.getState() === routerStates.READY) {
        this.#lifecycle.stop();
        this.#routerFSM.send(routerEvents.STOP);
      }

      throw error;
    }
  }

  stop(): this {
    this.#cancelTransitionIfRunning();

    const prevState = this.#routerFSM.getState();

    if (
      prevState !== routerStates.READY &&
      prevState !== routerStates.TRANSITIONING
    ) {
      return this;
    }

    this.#lifecycle.stop();
    this.#routerFSM.send(routerEvents.STOP);

    return this;
  }

  dispose(): void {
    if (this.#routerFSM.getState() === routerStates.DISPOSED) {
      return;
    }

    this.#cancelTransitionIfRunning();

    const state = this.#routerFSM.getState();

    if (state === routerStates.READY || state === routerStates.TRANSITIONING) {
      this.#lifecycle.stop();
      this.#routerFSM.send(routerEvents.STOP);
    }

    this.#routerFSM.send(routerEvents.DISPOSE);
    this.#emitter.clearAll();

    this.#plugins.disposeAll();
    this.#middleware.clearAll();
    this.#routes.clearRoutes();
    this.#routeLifecycle.clearAll();
    this.#state.reset();
    this.#dependencies.reset();
    this.#currentToState = undefined;

    this.#markDisposed();
  }

  // ============================================================================
  // Route Lifecycle (Guards)
  // ============================================================================

  addDeactivateGuard(
    name: string,
    canDeactivateHandler: ActivationFnFactory<Dependencies> | boolean,
  ): this {
    if (!this.#noValidate) {
      // 1. Validate input
      validateRouteName(name, "addDeactivateGuard");
      RouteLifecycleNamespace.validateHandler(
        canDeactivateHandler,
        "addDeactivateGuard",
      );

      // 2. Validate not registering
      RouteLifecycleNamespace.validateNotRegistering(
        this.#routeLifecycle.isRegistering(name),
        name,
        "addDeactivateGuard",
      );
    }

    // 3. Check if overwrite and validate limit
    const isOverwrite = this.#routeLifecycle.hasCanDeactivate(name);

    if (!isOverwrite && !this.#noValidate) {
      RouteLifecycleNamespace.validateHandlerLimit(
        this.#routeLifecycle.countCanDeactivate() + 1,
        "addDeactivateGuard",
        this.#limits.maxLifecycleHandlers,
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

  addActivateGuard(
    name: string,
    canActivateHandler: ActivationFnFactory<Dependencies> | boolean,
  ): this {
    if (!this.#noValidate) {
      // 1. Validate input
      validateRouteName(name, "addActivateGuard");
      RouteLifecycleNamespace.validateHandler(
        canActivateHandler,
        "addActivateGuard",
      );

      // 2. Validate not registering
      RouteLifecycleNamespace.validateNotRegistering(
        this.#routeLifecycle.isRegistering(name),
        name,
        "addActivateGuard",
      );
    }

    // 3. Check if overwrite and validate limit
    const isOverwrite = this.#routeLifecycle.hasCanActivate(name);

    if (!isOverwrite && !this.#noValidate) {
      RouteLifecycleNamespace.validateHandlerLimit(
        this.#routeLifecycle.countCanActivate() + 1,
        "addActivateGuard",
        this.#limits.maxLifecycleHandlers,
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

    if (!this.hasRoute(name)) {
      return false;
    }

    const { name: resolvedName, params: resolvedParams } = this.forwardState(
      name,
      params ?? {},
    );
    const toState = this.makeState(resolvedName, resolvedParams);
    const fromState = this.getState();

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
  // Middleware
  // ============================================================================

  useMiddleware(
    ...middlewares: MiddlewareFactory<Dependencies>[]
  ): Unsubscribe {
    if (!this.#noValidate) {
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
        this.#limits.maxMiddleware,
      );
    }

    // 4. Initialize (without committing)
    const initialized = this.#middleware.initialize(...middlewares);

    // 5. Validate results
    if (!this.#noValidate) {
      for (const { middleware, factory } of initialized) {
        MiddlewareNamespace.validateMiddleware<Dependencies>(
          middleware,
          factory,
        );
      }
    }

    // 6. Commit
    return this.#middleware.commit(initialized);
  }

  // ============================================================================
  // Dependencies (backed by DependenciesNamespace)
  // ============================================================================

  setDependency<K extends keyof Dependencies & string>(
    dependencyName: K,
    dependency: Dependencies[K],
  ): this {
    if (!this.#noValidate) {
      DependenciesNamespace.validateSetDependencyArgs(dependencyName);
    }

    this.#dependencies.set(dependencyName, dependency);

    return this;
  }

  setDependencies(deps: Dependencies): this {
    if (!this.#noValidate) {
      DependenciesNamespace.validateDependenciesObject(deps, "setDependencies");
      DependenciesNamespace.validateDependencyLimit(
        this.#dependencies.count(),
        Object.keys(deps).length,
        "setDependencies",
        this.#limits.maxDependencies,
      );
    }

    this.#dependencies.setMultiple(deps);

    return this;
  }

  getDependency<K extends keyof Dependencies>(key: K): Dependencies[K] {
    if (!this.#noValidate) {
      DependenciesNamespace.validateName(key, "getDependency");
    }

    const value = this.#dependencies.get(key);

    if (!this.#noValidate) {
      DependenciesNamespace.validateDependencyExists(value, key as string);
    }

    return value;
  }

  getDependencies(): Partial<Dependencies> {
    return this.#dependencies.getAll();
  }

  removeDependency(dependencyName: keyof Dependencies): this {
    if (!this.#noValidate) {
      DependenciesNamespace.validateName(dependencyName, "removeDependency");
    }

    this.#dependencies.remove(dependencyName);

    return this;
  }

  hasDependency(dependencyName: keyof Dependencies): boolean {
    if (!this.#noValidate) {
      DependenciesNamespace.validateName(dependencyName, "hasDependency");
    }

    return this.#dependencies.has(dependencyName);
  }

  resetDependencies(): this {
    this.#dependencies.reset();

    return this;
  }

  // ============================================================================
  // Events (backed by EventEmitter)
  // ============================================================================

  addEventListener<E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ): Unsubscribe {
    if (!this.#noValidate) {
      validateListenerArgs(eventName, cb);
    }

    return this.#emitter.on(
      eventName,
      cb as (...args: RouterEventMap[typeof eventName]) => void,
    );
  }

  // ============================================================================
  // Subscription (backed by EventEmitter)
  // ============================================================================

  subscribe(listener: SubscribeFn): Unsubscribe {
    if (!this.#noValidate) {
      validateSubscribeListener(listener);
    }

    return this.#emitter.on(
      events.TRANSITION_SUCCESS,
      (toState: State, fromState?: State) => {
        listener({
          route: toState,
          previousRoute: fromState,
        });
      },
    );
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  navigate(routeName: string): Promise<State>;
  navigate(routeName: string, routeParams: Params): Promise<State>;
  navigate(
    routeName: string,
    routeParams: Params,
    options: NavigationOptions,
  ): Promise<State>;
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

  navigateToState(
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
  ): Promise<State> {
    if (!this.#noValidate) {
      NavigationNamespace.validateNavigateToStateArgs(toState, fromState, opts);
    }

    return this.#navigation.navigateToState(toState, fromState, opts);
  }

  // ============================================================================
  // Cloning
  // ============================================================================

  clone(dependencies?: Dependencies): Router<Dependencies> {
    if (!this.#noValidate) {
      CloneNamespace.validateCloneArgs(dependencies);
    }

    return this.#clone.clone(
      dependencies,
      (routes, options, deps) =>
        new Router<Dependencies>(routes, options, deps),
    );
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

  /**
   * Cancels an in-flight transition if one is running.
   * Used by stop() and dispose() to abort before changing FSM state.
   */
  #cancelTransitionIfRunning(): void {
    if (!this.#routerFSM.canSend(routerEvents.CANCEL)) {
      return;
    }

    this.#routerFSM.send(routerEvents.CANCEL, {
      toState: this.#currentToState!, // eslint-disable-line @typescript-eslint/no-non-null-assertion -- guaranteed set before TRANSITIONING
      fromState: this.#state.get(),
    });
    this.#currentToState = undefined;
  }

  // ============================================================================
  // Dependency wiring (private)
  // ============================================================================

  /**
   * Sets up dependencies between namespaces.
   * Called once in constructor after all namespaces are created.
   */
  #setupDependencies(): void {
    this.#setupLimits();
    this.#setupRouteLifecycleDeps();
    this.#setupRoutesDeps();
    this.#setupMiddlewareDeps();
    this.#setupPluginsDeps();
    this.#setupNavigationDeps();
    this.#setupLifecycleDeps();
    this.#setupFSMActions();
    this.#setupStateDeps();
    this.#setupCyclicDeps();
    this.#setupCloneCallbacks();
  }

  #setupLimits(): void {
    this.#dependencies.setLimits(this.#limits);
    this.#plugins.setLimits(this.#limits);
    this.#middleware.setLimits(this.#limits);
    this.#emitter.setLimits({
      maxListeners: this.#limits.maxListeners,
      warnListeners: this.#limits.warnListeners,
      maxEventDepth: this.#limits.maxEventDepth,
    });
    this.#routeLifecycle.setLimits(this.#limits);
  }

  // RouteLifecycleNamespace must be set up FIRST because RoutesNamespace.setDependencies()
  // will register pending canActivate handlers which need RouteLifecycleNamespace
  #setupRouteLifecycleDeps(): void {
    this.#routeLifecycle.setRouter(this);

    const routeLifecycleDeps: RouteLifecycleDependencies<Dependencies> = {
      getDependency: <K extends keyof Dependencies>(dependencyName: K) =>
        this.#dependencies.get(dependencyName),
    };

    this.#routeLifecycle.setDependencies(routeLifecycleDeps);
  }

  #setupRoutesDeps(): void {
    const routesDeps: RoutesDependencies<Dependencies> = {
      addActivateGuard: (name, handler) => {
        this.addActivateGuard(name, handler);
      },
      addDeactivateGuard: (name, handler) => {
        this.addDeactivateGuard(name, handler);
      },
      makeState: (name, params, path, meta) =>
        this.#state.makeState(name, params, path, meta),
      getState: () => this.#state.get(),
      areStatesEqual: (state1, state2, ignoreQueryParams) =>
        this.#state.areStatesEqual(state1, state2, ignoreQueryParams),
      getDependency: (name) => this.#dependencies.get(name),
      forwardState: (name, params) => this.forwardState(name, params),
    };

    this.#routes.setDependencies(routesDeps);
    this.#routes.setLifecycleNamespace(this.#routeLifecycle);
  }

  #setupMiddlewareDeps(): void {
    this.#middleware.setRouter(this);

    const middlewareDeps: MiddlewareDependencies<Dependencies> = {
      getDependency: <K extends keyof Dependencies>(dependencyName: K) =>
        this.#dependencies.get(dependencyName),
    };

    this.#middleware.setDependencies(middlewareDeps);
  }

  #setupPluginsDeps(): void {
    this.#plugins.setRouter(this);

    const pluginsDeps: PluginsDependencies<Dependencies> = {
      addEventListener: (eventName, cb) =>
        this.#emitter.on(
          eventName,
          cb as (...args: RouterEventMap[typeof eventName]) => void,
        ),
      canNavigate: () => this.#routerFSM.canSend(routerEvents.NAVIGATE),
      getDependency: <K extends keyof Dependencies>(dependencyName: K) =>
        this.#dependencies.get(dependencyName),
    };

    this.#plugins.setDependencies(pluginsDeps);
  }

  #setupNavigationDeps(): void {
    const navigationDeps: NavigationDependencies = {
      getOptions: () => this.#options.get(),
      hasRoute: (name) => this.#routes.hasRoute(name),
      getState: () => this.#state.get(),
      setState: (state) => {
        this.#state.set(state);
      },
      buildStateWithSegments: (routeName, routeParams) => {
        // Call forwardState to allow plugin interception
        const { name, params } = this.forwardState(routeName, routeParams);

        return this.#routes.buildStateWithSegmentsResolved(name, params);
      },
      makeState: (name, params, path, meta) =>
        this.#state.makeState(name, params, path, meta),
      buildPath: (route, params) =>
        this.#routes.buildPath(route, params, this.#options.get()),
      areStatesEqual: (state1, state2, ignoreQueryParams) =>
        this.#state.areStatesEqual(state1, state2, ignoreQueryParams),
      getDependency: (name: string) =>
        this.#dependencies.get(name as keyof Dependencies),
      startTransition: (toState, fromState) => {
        this.#currentToState = toState;
        this.#routerFSM.send(routerEvents.NAVIGATE, {
          toState,
          fromState,
        });
      },
      cancelNavigation: () => {
        this.#routerFSM.send(routerEvents.CANCEL, {
          toState: this.#currentToState!, // eslint-disable-line @typescript-eslint/no-non-null-assertion -- guaranteed set before TRANSITIONING
          fromState: this.#state.get(),
        });
        this.#currentToState = undefined;
      },
      sendTransitionDone: (state, fromState, opts) => {
        this.#routerFSM.send(routerEvents.COMPLETE, {
          state,
          fromState,
          opts,
        });
        this.#currentToState = undefined;
      },
      sendTransitionBlocked: (toState, fromState, error) => {
        this.#routerFSM.send(routerEvents.FAIL, {
          toState,
          fromState,
          error,
        });
        this.#currentToState = undefined;
      },
      sendTransitionError: (toState, fromState, error) => {
        this.#routerFSM.send(routerEvents.FAIL, {
          toState,
          fromState,
          error,
        });
        this.#currentToState = undefined;
      },
      emitTransitionError: (toState, fromState, error) => {
        if (this.#routerFSM.getState() === routerStates.READY) {
          this.#routerFSM.send(routerEvents.FAIL, {
            toState,
            fromState,
            error,
          });
        } else {
          // TRANSITIONING: concurrent navigation with invalid args.
          // Direct emit to avoid disturbing the ongoing transition.
          this.#emitter.emit(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            error as RouterError,
          );
        }
      },
    };

    this.#navigation.setDependencies(navigationDeps);

    const transitionDeps: TransitionDependencies = {
      getLifecycleFunctions: () => this.#routeLifecycle.getFunctions(),
      getMiddlewareFunctions: () => this.#middleware.getFunctions(),
      isActive: () => this.isActive(),

      isTransitioning: () =>
        this.#routerFSM.getState() === routerStates.TRANSITIONING,
      clearCanDeactivate: (name) => {
        this.#routeLifecycle.clearCanDeactivate(name);
      },
    };

    this.#navigation.setTransitionDependencies(transitionDeps);
  }

  #setupLifecycleDeps(): void {
    const lifecycleDeps: RouterLifecycleDependencies = {
      getOptions: () => this.#options.get(),
      makeNotFoundState: (path, options) =>
        this.#state.makeNotFoundState(path, options),
      setState: (state) => {
        this.#state.set(state);
      },
      matchPath: (path, source?: string) =>
        this.#routes.matchPath(path, source, this.#options.get()),
      completeStart: () => {
        this.#routerFSM.send(routerEvents.STARTED);
      },
      emitTransitionError: (toState, fromState, error) => {
        this.#routerFSM.send(routerEvents.FAIL, {
          toState,
          fromState,
          error,
        });
      },
    };

    this.#lifecycle.setDependencies(lifecycleDeps);
  }

  #setupFSMActions(): void {
    const fsm = this.#routerFSM;

    fsm.on(routerStates.STARTING, routerEvents.STARTED, () => {
      this.#emitter.emit(events.ROUTER_START);
    });

    fsm.on(routerStates.READY, routerEvents.STOP, () => {
      this.#emitter.emit(events.ROUTER_STOP);
    });

    fsm.on(routerStates.READY, routerEvents.NAVIGATE, (p) => {
      this.#emitter.emit(events.TRANSITION_START, p.toState, p.fromState);
    });

    fsm.on(routerStates.TRANSITIONING, routerEvents.COMPLETE, (p) => {
      this.#emitter.emit(
        events.TRANSITION_SUCCESS,
        p.state,
        p.fromState,
        p.opts,
      );
    });

    fsm.on(routerStates.TRANSITIONING, routerEvents.CANCEL, (p) => {
      this.#emitter.emit(events.TRANSITION_CANCEL, p.toState, p.fromState);
    });

    fsm.on(routerStates.STARTING, routerEvents.FAIL, (p) => {
      this.#emitter.emit(
        events.TRANSITION_ERROR,
        p.toState,
        p.fromState,
        p.error as RouterError | undefined,
      );
    });

    fsm.on(routerStates.READY, routerEvents.FAIL, (p) => {
      this.#emitter.emit(
        events.TRANSITION_ERROR,
        p.toState,
        p.fromState,
        p.error as RouterError | undefined,
      );
    });

    fsm.on(routerStates.TRANSITIONING, routerEvents.FAIL, (p) => {
      this.#emitter.emit(
        events.TRANSITION_ERROR,
        p.toState,
        p.fromState,
        p.error as RouterError | undefined,
      );
    });
  }

  #setupStateDeps(): void {
    this.#state.setDependencies({
      getDefaultParams: () => this.#routes.getConfig().defaultParams,
      buildPath: (name, params) =>
        this.#routes.buildPath(name, params, this.#options.get()),
      getUrlParams: (name) => this.#routes.getUrlParams(name),
    });
  }

  #setupCyclicDeps(): void {
    // Navigation → canNavigate() (check before navigation)
    this.#navigation.canNavigate = () =>
      this.#routerFSM.canSend(routerEvents.NAVIGATE);

    // RouterLifecycle → Navigation.navigateToState() (for start transitions)
    // Use facade method so tests can spy on router.navigateToState
    this.#lifecycle.navigateToState = (
      toState: State,
      fromState: State | undefined,
      opts: NavigationOptions,
    ) => this.#navigation.navigateToState(toState, fromState, opts);
  }

  #setupCloneCallbacks(): void {
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
        Object.assign(newConfig.forwardFnMap, config.forwardFnMap);

        typedRouter.#routes.setResolvedForwardMap({ ...resolvedForwardMap });
      },
    );
  }

  #markDisposed(): void {
    this.navigate = throwDisposed as never;
    this.navigateToDefault = throwDisposed as never;
    this.navigateToState = throwDisposed as never;
    this.start = throwDisposed as never;
    this.stop = throwDisposed as never;
    this.addRoute = throwDisposed as never;
    this.removeRoute = throwDisposed as never;
    this.clearRoutes = throwDisposed as never;
    this.updateRoute = throwDisposed as never;
    this.addActivateGuard = throwDisposed as never;
    this.addDeactivateGuard = throwDisposed as never;
    this.removeActivateGuard = throwDisposed as never;
    this.removeDeactivateGuard = throwDisposed as never;
    this.usePlugin = throwDisposed as never;
    this.useMiddleware = throwDisposed as never;
    this.setDependency = throwDisposed as never;
    this.setDependencies = throwDisposed as never;
    this.removeDependency = throwDisposed as never;
    this.resetDependencies = throwDisposed as never;
    this.addEventListener = throwDisposed as never;
    this.subscribe = throwDisposed as never;
    this.setRootPath = throwDisposed as never;
    this.clone = throwDisposed as never;
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
    /* v8 ignore next -- @preserve branch: queryParams always set via defaultOptions */
    queryParams: options.queryParams ?? {},
  };
}
