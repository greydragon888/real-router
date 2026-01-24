// packages/core-types/modules/router.ts

import type {
  State,
  SimpleState,
  Params,
  DoneFn,
  NavigationOptions,
  Unsubscribe,
  CancelFn,
  StateMetaInput,
  RouterError,
} from "./base";
import type { EventsKeys, EventToNameMap } from "./constants";
import type {
  QueryParamsMode,
  QueryParamsOptions,
  RouteTreeState,
} from "./route-node-types";
import type { LoggerConfig } from "@real-router/logger";

/**
 * Extended build result that includes segments for path building.
 * Used internally to avoid duplicate getSegmentsByName calls.
 *
 * @param segments - Route segments from getSegmentsByName (typed as unknown[] for cross-package compatibility)
 * @internal
 */
export interface BuildStateResultWithSegments<P extends Params = Params> {
  readonly state: RouteTreeState<P>;
  readonly segments: readonly unknown[];
}

/**
 * Route configuration.
 */
export interface Route<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  [key: string]: unknown;
  /** Route name (dot-separated for nested routes). */
  name: string;
  /** URL path pattern for this route. */
  path: string;
  /** Factory function that returns a guard for route activation. */
  canActivate?: ActivationFnFactory<Dependencies>;
  /**
   * Redirects navigation to another route.
   *
   * IMPORTANT: forwardTo creates a URL alias, not a transition chain.
   * Guards (canActivate) on the source route are NOT executed.
   * Only guards on the final destination are executed.
   *
   * This matches Vue Router and Angular Router behavior.
   *
   * @example
   * // Correct: guard on target
   * { name: "old", path: "/old", forwardTo: "new" }
   * { name: "new", path: "/new", canActivate: myGuard }
   *
   * // Wrong: guard on source (will be ignored with warning)
   * { name: "old", path: "/old", forwardTo: "new", canActivate: myGuard }
   */
  forwardTo?: string;
  /** Nested child routes. */
  children?: Route<Dependencies>[];
  /** Encodes state params to URL params. */
  encodeParams?: (stateParams: Params) => Params;
  /** Decodes URL params to state params. */
  decodeParams?: (pathParams: Params) => Params;
  /**
   * Default parameters for this route.
   *
   * @remarks
   * **Type Contract:**
   * The type of defaultParams MUST match the expected params type P
   * when using `router.makeState<P>()` or `router.navigate<P>()`.
   *
   * These values are merged into state.params when creating route states.
   * Missing URL params are filled from defaultParams.
   *
   * @example
   * ```typescript
   * // Define route with pagination defaults
   * {
   *   name: "users",
   *   path: "/users",
   *   defaultParams: { page: 1, limit: 10 }
   * }
   *
   * // Navigate without specifying page/limit
   * router.navigate("users", { filter: "active" });
   * // Result: state.params = { page: 1, limit: 10, filter: "active" }
   *
   * // Correct typing — include defaultParams properties
   * type UsersParams = { page: number; limit: number; filter?: string };
   * ```
   */
  defaultParams?: Params;
}

/**
 * Router configuration options.
 *
 * Note: For input, use `Partial<Options>` as all fields have defaults.
 * After initialization, `getOptions()` returns resolved `Options` with all fields populated.
 */
export interface Options {
  /**
   * Default route to navigate to on start.
   * Empty string means no default route.
   *
   * @default ""
   */
  defaultRoute: string;

  /**
   * Default parameters for the default route.
   *
   * @default {}
   */
  defaultParams: Params;

  /**
   * How to handle trailing slashes in URLs.
   * - "strict": Route must match exactly
   * - "never": Always remove trailing slash
   * - "always": Always add trailing slash
   * - "preserve": Keep as provided
   *
   * @default "preserve"
   */
  trailingSlash: "strict" | "never" | "always" | "preserve";

  /**
   * Whether route names are case-sensitive.
   *
   * @default false
   */
  caseSensitive: boolean;

  /**
   * How to encode URL parameters.
   * - "default": Standard encoding
   * - "uri": URI encoding (encodeURI)
   * - "uriComponent": Component encoding (encodeURIComponent)
   * - "none": No encoding
   *
   * @default "default"
   */
  urlParamsEncoding: "default" | "uri" | "uriComponent" | "none";

  /**
   * How to handle query parameters.
   *
   * @default "loose"
   */
  queryParamsMode: QueryParamsMode;

  /**
   * Query parameter parsing options.
   *
   * @default undefined
   */
  queryParams?: QueryParamsOptions;

  /**
   * Allow matching routes that don't exist.
   * When true, unknown routes navigate without error.
   *
   * @default true
   */
  allowNotFound: boolean;

  /**
   * Rewrite path on successful match.
   *
   * @default false
   */
  rewritePathOnMatch: boolean;

  /**
   * Logger configuration.
   *
   * @default undefined
   */
  logger?: Partial<LoggerConfig>;
}

export type ActivationFn = (
  toState: State,
  fromState: State | undefined,
  done: DoneFn,
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
) => boolean | Promise<boolean | object | void> | State | void;

export type ActivationFnFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
) => ActivationFn;

export type DefaultDependencies = object;

export interface Config {
  decoders: Record<string, (params: Params) => Params>;
  encoders: Record<string, (params: Params) => Params>;
  defaultParams: Record<string, Params>;
  forwardMap: Record<string, string>;
}

/**
 * Configuration update options for updateRoute().
 * All properties are optional. Set to null to remove the configuration.
 */
export interface RouteConfigUpdate<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  /** Set to null to remove forwardTo */
  forwardTo?: string | null;
  /** Set to null to remove defaultParams */
  defaultParams?: Params | null;
  /** Set to null to remove decoder */
  decodeParams?: ((params: Params) => Params) | null;
  /** Set to null to remove encoder */
  encodeParams?: ((params: Params) => Params) | null;
  /** Set to null to remove canActivate */
  canActivate?: ActivationFnFactory<Dependencies> | null;
}

export interface Router<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  [key: symbol]: unknown;
  [key: string]: unknown;

  addRoute: (
    routes: Route<Dependencies>[] | Route<Dependencies>,
  ) => Router<Dependencies>;

  isActiveRoute: (
    name: string,
    params?: Params,
    strictEquality?: boolean,
    ignoreQueryParams?: boolean,
  ) => boolean;
  buildPath: (route: string, params?: Params) => string;

  /**
   * Internal path builder that accepts pre-computed segments.
   * Avoids duplicate getSegmentsByName call when segments are already available.
   *
   * @param segments - Route segments from getSegmentsByName (typed as unknown[] for cross-package compatibility)
   * @internal
   */
  buildPathWithSegments: (
    route: string,
    params: Params,
    segments: readonly unknown[],
  ) => string;
  matchPath: <P extends Params = Params, MP extends Params = Params>(
    path: string,
    source?: string,
  ) => State<P, MP> | undefined;
  /**
   * Sets the root path for the router.
   *
   * @param rootPath - New root path
   * @returns void
   */
  setRootPath: (rootPath: string) => void;

  /**
   * Gets the current root path for the router.
   *
   * @returns Current root path
   */
  getRootPath: () => string;

  /**
   * Removes route configurations (metadata only).
   *
   * @description
   * Clears associated configurations for a route (decoders, encoders, defaultParams,
   * forwardMap). Note: RouteNode doesn't provide API for actual route removal from tree.
   * Consider recreating the router with filtered routes for full removal.
   *
   * @param name - Route name to remove configurations for
   * @returns Router instance for chaining
   * @throws {TypeError} If name is not a valid route name
   */
  removeRoute: (name: string) => Router<Dependencies>;

  /**
   * Clears all routes from the router.
   *
   * @description
   * Removes all route definitions, configurations, and lifecycle handlers.
   * Preserves: listeners, plugins, dependencies, options, state.
   * After clearing, you can add new routes with addRoute().
   *
   * @returns Router instance for chaining
   *
   * @example
   * // Clear all routes and add new ones
   * router.clearRoutes().addRoute([
   *   { name: 'home', path: '/' },
   *   { name: 'about', path: '/about' }
   * ]);
   */
  clearRoutes: () => Router<Dependencies>;

  /**
   * Retrieves the full configuration of a route by name.
   *
   * @description
   * Reconstructs the Route object from internal storage, including:
   * - name, path, children from route definitions
   * - forwardTo from forwardMap
   * - defaultParams, decodeParams, encodeParams from config
   * - canActivate from lifecycle factories
   *
   * Note: Custom properties (meta, etc.) are NOT preserved and won't be returned.
   *
   * @param name - Route name (dot-notation for nested routes, e.g., 'users.profile')
   * @returns Route configuration or undefined if not found
   *
   * @throws {TypeError} If name is not a valid route name
   *
   * @example
   * const route = router.getRoute('users.profile');
   * if (route) {
   *   console.log(route.path, route.defaultParams);
   * }
   */
  getRoute: (name: string) => Route<Dependencies> | undefined;

  /**
   * Checks if a route exists in the router.
   *
   * @description
   * Lightweight check for route existence without constructing the full Route object.
   * More efficient than `!!router.getRoute(name)` when you only need to check existence.
   *
   * @param name - Route name to check (supports dot notation for nested routes)
   * @returns true if route exists, false otherwise
   *
   * @throws {TypeError} If name is not a valid route name
   *
   * @example
   * if (router.hasRoute('users.profile')) {
   *   router.navigate('users.profile', { id: 123 });
   * }
   */
  hasRoute: (name: string) => boolean;

  /**
   * Updates configuration properties of an existing route.
   *
   * @description
   * Only updates configuration (forwardTo, defaultParams, encoders, decoders, canActivate).
   * Does NOT update path or children (requires tree rebuild - use removeRoute + addRoute).
   *
   * Set a property to null to remove it. For example:
   * - `{ forwardTo: null }` removes the forwardTo redirect
   * - `{ canActivate: null }` removes the canActivate guard
   *
   * @param name - Route name to update
   * @param updates - Partial route configuration to apply
   * @returns Router instance for chaining
   *
   * @throws {TypeError} If name is not a valid route name
   * @throws {ReferenceError} If route does not exist
   * @throws {Error} If updating forwardTo with invalid target or cycle
   *
   * @example
   * // Add/update configuration
   * router.updateRoute('users', {
   *   defaultParams: { page: 1 },
   *   canActivate: authGuard
   * });
   *
   * @example
   * // Remove configuration
   * router.updateRoute('oldRoute', { forwardTo: null });
   */
  updateRoute: (
    name: string,
    updates: RouteConfigUpdate<Dependencies>,
  ) => Router<Dependencies>;

  /**
   * Returns a copy of the previous state before the last navigation.
   *
   * @returns Copy of the previous state or undefined if no previous state exists
   */
  getPreviousState: () => State | undefined;

  shouldUpdateNode: (
    nodeName: string,
  ) => (toState: State, fromState?: State) => boolean;

  /**
   * Returns a copy of the router's current configuration options.
   *
   * @description
   * Provides read-only access to the router's configuration by returning a shallow
   * copy of all current options. This method is useful for inspecting settings,
   * debugging, passing configuration to other components, or conditional logic
   * based on router configuration.
   *
   * @returns A shallow copy of the current router options. Each call returns
   *          a new object with all configuration properties.
   *
   * @example
   * // Basic usage - inspect configuration
   * const options = router.getOptions();
   * console.log('Case sensitive:', options.caseSensitive);
   * console.log('Trailing slash mode:', options.trailingSlash);
   *
   * @see {@link setOption} for modifying individual options
   */
  getOptions: () => Options;

  /**
   * Sets a single configuration option value.
   *
   * @description
   * Modifies an individual router configuration option with type-safe validation.
   * This method can ONLY be used before calling router.start() - after the router
   * starts, all options become immutable and any attempt to modify them will throw
   * an error.
   *
   * @param option - The name of the option to set. Must be a valid option key.
   * @param value - The new value for the option. Type must match the option's expected type.
   *
   * @returns The router instance for method chaining.
   *
   * @throws {Error} If router is already started (router.isStarted() === true)
   * @throws {ReferenceError} If option name doesn't exist in Options interface
   * @throws {TypeError} If value type doesn't match expected type for the option
   * @throws {TypeError} If object option receives non-plain object (array, date, class, null)
   *
   * @see {@link getOptions} for retrieving current options
   */
  setOption: (
    option: keyof Options,
    value: Options[keyof Options],
  ) => Router<Dependencies>;

  makeState: <P extends Params = Params, MP extends Params = Params>(
    name: string,
    params?: P,
    path?: string,
    meta?: StateMetaInput<MP>,
    forceId?: number,
  ) => State<P, MP>;
  makeNotFoundState: (path: string, options?: NavigationOptions) => State;
  getState: <P extends Params = Params, MP extends Params = Params>() =>
    | State<P, MP>
    | undefined;
  setState: <P extends Params = Params, MP extends Params = Params>(
    state?: State<P, MP>,
  ) => void;
  areStatesEqual: (
    state1: State | undefined,
    state2: State | undefined,
    ignoreQueryParams?: boolean,
  ) => boolean;
  areStatesDescendants: (parentState: State, childState: State) => boolean;
  forwardState: <P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ) => SimpleState<P>;
  buildState: (
    routeName: string,
    routeParams: Params,
  ) => RouteTreeState | undefined;

  /**
   * Builds state with segments for internal use.
   * Avoids duplicate getSegmentsByName call when path building is needed.
   *
   * @internal
   */
  buildStateWithSegments: <P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ) => BuildStateResultWithSegments<P> | undefined;

  /**
   * Checks whether the router has been successfully started.
   *
   * @description
   * Returns true if the router has been started via the `start()` method and has not
   * been stopped. When the router is started, it means:
   * - Initial navigation has been attempted
   * - Event listeners can receive navigation events
   * - The router is ready to handle navigation requests
   *
   * Note: A router being "started" doesn't guarantee that the initial navigation
   * succeeded. Use `getState()` to verify if a valid state exists.
   *
   * @returns true if the router is started, false otherwise
   *
   * @example
   * // Check if router is started before navigation
   * if (!router.isStarted()) {
   *   router.start('/home');
   * }
   *
   * @example
   * // Conditional logic based on router state
   * const isReady = router.isStarted() && router.getState() !== undefined;
   */
  isStarted: () => boolean;

  /**
   * Checks if the router is active (starting or started).
   *
   * @description
   * Returns true if the router is in the process of starting or has already started.
   * This is different from `isStarted()` which only returns true after successful
   * initial transition.
   *
   * This method is primarily used internally by the transition module to determine
   * if transitions should be cancelled. During the initial start transition,
   * `isStarted()` is false but `isActive()` is true, allowing the transition to proceed.
   *
   * @returns true if router is active (starting or started), false if stopped
   *
   * @example
   * // Check if router is active (even during initial start)
   * if (router.isActive()) {
   *   console.log('Router is active');
   * }
   *
   * @see {@link isStarted} to check if initial transition completed
   * @see https://github.com/greydragon888/real-router/issues/50
   */
  isActive: () => boolean;

  /**
   * Checks if a navigation transition is currently in progress.
   *
   * @description
   * Returns true when the router is actively processing a navigation request.
   * This includes the time spent executing guards (canDeactivate, canActivate)
   * and middleware functions.
   *
   * Useful for:
   * - Preventing route modifications during navigation
   * - Showing loading indicators
   * - Debouncing navigation requests
   *
   * @returns true if navigation is in progress, false otherwise
   *
   * @example
   * // Prevent route removal during navigation
   * if (router.isNavigating()) {
   *   console.warn('Cannot modify routes during navigation');
   *   return;
   * }
   *
   * @example
   * // Show loading state
   * const isLoading = router.isNavigating();
   *
   * @remarks
   * After FSM migration (RFC-2), this will use RouterState.TRANSITIONING
   * for more granular state tracking.
   */
  isNavigating: () => boolean;

  /**
   * Initializes the router and performs the initial navigation.
   *
   * @description
   * Starts the router and navigates to the initial route. This method must be called
   * before any navigation operations. The initial route can be specified as a path
   * string, a state object, or determined by the default route option.
   *
   * @param startPathOrState - Optional. The initial route as a path string or state object.
   *                          If omitted, uses the default route if configured.
   * @param done - Optional. Callback function called when start completes or fails.
   *
   * @returns The router instance for method chaining
   *
   * @example
   * router.start()
   *
   * @example
   * router.start('/users/123', (err, state) => {
   *   if (!err) console.log('Started at:', state.name)
   * })
   */
  start: (() => Router<Dependencies>) &
    ((done: DoneFn) => Router<Dependencies>) &
    ((startPathOrState: string | State) => Router<Dependencies>) &
    ((startPathOrState: string | State, done: DoneFn) => Router<Dependencies>);

  /**
   * Stops the router and cleans up its state.
   *
   * @description
   * Stops the router, clearing the current state and preventing further navigation.
   * This method should be called when the router is no longer needed, typically
   * during application cleanup or before unmounting.
   *
   * If the router is not started, this method does nothing and returns silently.
   *
   * @returns The router instance for method chaining
   *
   * @example
   * // Stop the router
   * router.stop();
   *
   * @fires ROUTER_STOP - When the router is successfully stopped
   *
   * @see {@link start} to restart the router
   * @see {@link isStarted} to check router status
   */
  stop: () => Router<Dependencies>;

  canDeactivate: (
    name: string,
    canDeactivateHandler: ActivationFnFactory<Dependencies> | boolean,
  ) => Router<Dependencies>;
  clearCanDeactivate: (name: string, silent?: boolean) => Router<Dependencies>;
  canActivate: (
    name: string,
    canActivateHandler: ActivationFnFactory<Dependencies> | boolean,
  ) => Router<Dependencies>;
  clearCanActivate: (name: string, silent?: boolean) => Router<Dependencies>;
  getLifecycleFactories: () => [
    Record<string, ActivationFnFactory<Dependencies>>,
    Record<string, ActivationFnFactory<Dependencies>>,
  ];
  getLifecycleFunctions: () => [
    Map<string, ActivationFn>,
    Map<string, ActivationFn>,
  ];

  /**
   * Registers plugin(s) to extend router functionality through lifecycle event subscriptions.
   *
   * @description
   * Provides the primary mechanism for adding cross-cutting functionality to the router
   * through a plugin-based architecture. Plugins can react to router lifecycle events
   * (start/stop, navigation transitions) without modifying the core router code.
   *
   * @param plugins - Variable number of plugin factory functions.
   *                 Each factory receives (router, getDependency) and must return
   *                 a Plugin object with optional event handler methods.
   *
   * @returns Unsubscribe function that removes only the plugins registered in this call.
   *          Calls teardown() for each plugin and removes all event subscriptions.
   *          Safe to call multiple times (subsequent calls are no-op with error logging).
   *
   * @throws {TypeError} If any plugin parameter is not a function
   * @throws {TypeError} If any factory returns a non-object value
   * @throws {TypeError} If returned plugin object contains unknown properties
   * @throws {Error} If any plugin factory is already registered (duplicate by reference)
   * @throws {Error} If total plugin count would exceed 50 after registration
   * @throws {*} Rethrows any exception thrown by factory functions (after rollback)
   *
   * @example
   * // Basic logging plugin
   * const loggingPlugin = (router) => ({
   *   onTransitionStart: (toState, fromState) => {
   *     console.log(`Navigating: ${fromState?.name} → ${toState.name}`);
   *   },
   *   onTransitionSuccess: (toState) => {
   *     console.log(`Arrived at: ${toState.name}`);
   *   },
   * });
   *
   * @example
   * // Remove plugin
   * const remove = router.usePlugin(loggerPlugin)
   * remove() // Stop logging
   *
   * const unsubscribe = router.usePlugin(loggingPlugin);
   *
   * @see {@link getPlugins} for retrieving registered plugin factories (internal use)
   * @see {@link useMiddleware} for navigation-specific middleware (different from plugins)
   * @see {@link addEventListener} for low-level event subscription
   */
  usePlugin: (...plugins: PluginFactory<Dependencies>[]) => Unsubscribe;
  getPlugins: () => PluginFactory<Dependencies>[];

  /**
   * Registers middleware functions to execute during navigation transitions.
   *
   * @description
   * Provides the primary mechanism for adding custom logic to the navigation pipeline
   * through middleware functions. Middleware execute after lifecycle hooks (canActivate/
   * canDeactivate) and can modify or validate state during route transitions.
   *
   * @param middlewares - Variable number of middleware factory functions.
   *                     Each factory receives (router, getDependency) and must return
   *                     a middleware function with signature:
   *                     (toState, fromState, done) => void | Promise<State | boolean | void>
   *
   * @returns Unsubscribe function that removes only the middleware registered in this call.
   *          Safe to call multiple times (subsequent calls are no-op with warnings).
   *
   * @throws {TypeError} If any middleware parameter is not a function
   * @throws {TypeError} If any factory returns a non-function value
   * @throws {Error} If any middleware factory is already registered (duplicate)
   * @throws {Error} If total middleware count would exceed 50 after registration
   * @throws {*} Rethrows any exception thrown by factory functions during initialization
   *
   * @example
   *
   * router.useMiddleware((router) => (toState, fromState, done) => {
   *   console.log('Navigating to:', toState.name)
   *   done()
   * })
   *
   * @example
   * // Auth middleware
   * router.useMiddleware(() => (toState, fromState, done) => {
   *   if (toState.meta.requiresAuth && !isAuthenticated()) {
   *     done({ redirect: { name: 'login' } })
   *   } else {
   *     done()
   *   }
   * })
   */
  useMiddleware: (
    ...middlewares: MiddlewareFactory<Dependencies>[]
  ) => Unsubscribe;
  clearMiddleware: () => Router<Dependencies>;
  getMiddlewareFactories: () => MiddlewareFactory<Dependencies>[];
  getMiddlewareFunctions: () => Middleware[];

  setDependency: <K extends keyof Dependencies & string>(
    dependencyName: K,
    dependency: Dependencies[K],
  ) => Router<Dependencies>;

  /**
   * Sets multiple dependencies at once using a batch operation.
   *
   * @description
   * Provides an optimized way to register multiple dependencies in a single operation.
   * This method is the primary approach for initializing dependencies during router
   * setup and for bulk updates of the dependency container.
   *
   * @param deps - Object containing dependencies to set. Must be a plain object.
   *               Properties with undefined values are ignored (not set).
   *               All other values (including null, false, 0) are set.
   *
   * @returns The router instance for method chaining.
   *
   * @throws {TypeError} If deps is not a plain object (e.g., class instance, array, null)
   * @throws {TypeError} If any property in deps has a getter (accessor property)
   * @throws {Error} If total dependencies would exceed 100 after the operation
   *
   * @example
   * // Basic batch setup
   * router.setDependencies({
   *   api: new ApiService(),
   *   logger: console,
   *   cache: cacheService,
   * });
   *
   * @see {@link setDependency} for setting individual dependencies
   * @see {@link getDependencies} for retrieving all dependencies
   * @see {@link resetDependencies} for clearing all dependencies
   * @see {@link removeDependency} for removing specific dependencies
   */
  setDependencies: (deps: Dependencies) => Router<Dependencies>;

  /**
   * Retrieves a dependency from the router's dependency container by name.
   *
   * @description
   * Provides type-safe access to dependencies registered in the router's dependency
   * injection container. This method is the primary way to access services and utilities
   * within middleware, plugins, and lifecycle hooks.
   *
   * @template K - The dependency name, must be a key of the Dependencies type
   *
   * @param key - The name of the dependency to retrieve. Must be a string and
   *              must exist in the Dependencies type definition.
   *
   * @returns The dependency value with proper type inference based on Dependencies type.
   *          Returns the same reference on repeated calls (not a copy).
   *
   * @throws {TypeError} If the key parameter is not a string type
   *                     (e.g., number, object, null, undefined)
   * @throws {ReferenceError} If no dependency exists with the given name.
   *                          Error message includes the dependency name for debugging.
   *
   * @example
   * // Basic usage - direct access
   * interface MyDependencies {
   *   api: ApiService;
   *   logger: Logger;
   * }
   *
   * router.setDependency('api', new ApiService());
   * const api = router.getDependency('api'); // Type: ApiService
   *
   * @see {@link getDependencies} for retrieving all dependencies at once
   * @see {@link setDependency} for registering dependencies
   * @see {@link hasDependency} for checking dependency existence
   * @see {@link removeDependency} for removing dependencies
   */
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K];

  /**
   * Returns a shallow copy of all registered dependencies.
   *
   * @description
   * Retrieves a snapshot of all dependencies currently stored in the router's
   * dependency container. The method creates a new object on each call, protecting
   * the internal container structure from external modifications.
   *
   * @returns A new object containing all dependencies as key-value pairs.
   *          Returns {} if no dependencies are registered.
   *
   * @example
   * // Basic usage - get all dependencies
   * const deps = router.getDependencies();
   * console.log(deps); // { api: ApiService, logger: Logger }
   *
   * @see {@link getDependency} for accessing individual dependencies
   * @see {@link setDependency} for adding dependencies
   * @see {@link setDependencies} for batch setting
   * @see {@link removeDependency} for removing dependencies
   * @see {@link resetDependencies} for clearing all dependencies
   * @see {@link hasDependency} for checking dependency existence
   */
  getDependencies: () => Partial<Dependencies>;

  /**
   * Removes a dependency from the router's dependency container.
   *
   * @description
   * Safely removes a registered dependency by name. This method is idempotent,
   * meaning it can be called multiple times with the same dependency name without
   * causing errors. If the dependency doesn't exist, a warning is logged but
   * execution continues normally.
   *
   * @param dependencyName - The name of the dependency to remove.
   *                         Type-safe in TypeScript (must be a key of Dependencies).
   *                         Safe to call with non-existent dependencies (logs warning).
   *
   * @returns The router instance for method chaining.
   *
   * @example
   * // Basic removal
   * router.setDependency('tempLogger', logger);
   * router.removeDependency('tempLogger');
   *
   * console.log(router.hasDependency('tempLogger')); // false
   *
   * @see {@link setDependency} for adding dependencies
   * @see {@link getDependency} for retrieving dependencies (throws after removal)
   * @see {@link hasDependency} for checking dependency existence (returns false after removal)
   * @see {@link resetDependencies} for removing all dependencies at once
   */
  removeDependency: (
    dependencyName: keyof Dependencies,
  ) => Router<Dependencies>;

  /**
   * Checks whether a dependency with the specified name exists in the router.
   *
   * @description
   * Provides a safe way to check for dependency existence without throwing errors.
   * This method is essential for implementing conditional logic based on optional
   * dependencies and for validating dependency setup before accessing them.
   *
   * @param dependencyName - The name of the dependency to check.
   *                         Type-safe in TypeScript (must be a key of Dependencies).
   *                         In runtime, non-string primitives are coerced to strings.
   *
   * @returns true if the dependency exists (even with falsy values like null/false/0),
   *          false if the dependency has never been set or was removed.
   *
   * @example
   * // Basic existence check
   * router.setDependency('api', apiService);
   * console.log(router.hasDependency('api')); // true
   * console.log(router.hasDependency('nonexistent')); // false
   *
   * const ready = hasAllDependencies(router, ['api', 'auth', 'logger']);
   *
   * @see {@link getDependency} for retrieving dependencies (throws if not found)
   * @see {@link getDependencies} for getting all dependencies at once
   * @see {@link setDependency} for registering dependencies
   * @see {@link removeDependency} for removing dependencies
   */
  hasDependency: (dependencyName: keyof Dependencies) => boolean;

  /**
   * Removes all dependencies from the router's dependency container.
   *
   * @description
   * Performs a complete reset of the dependency container by removing all registered
   * dependencies at once. This is a destructive operation that clears the entire
   * dependency state, effectively returning the container to its initial empty state.
   *
   * @returns The router instance for method chaining.
   *
   * @example
   * // Basic reset
   * router.setDependency('logger', logger);
   * router.setDependency('api', apiService);
   * router.setDependency('cache', cacheService);
   *
   * router.resetDependencies();
   *
   * console.log(router.getDependencies()); // {}
   * console.log(router.hasDependency('logger')); // false
   *
   * @see {@link setDependency} for adding individual dependencies
   * @see {@link setDependencies} for setting multiple dependencies at once
   * @see {@link removeDependency} for removing individual dependencies
   * @see {@link getDependencies} for getting all current dependencies
   * @see {@link hasDependency} for checking if specific dependency exists
   */
  resetDependencies: () => Router<Dependencies>;

  /**
   * Invokes all registered event listeners for a specific router lifecycle event.
   *
   * @internal
   * This is an internal method used by the router core. It should NOT be called
   * directly by application code. Events are automatically dispatched by router
   * methods like start(), stop(), navigate(), etc.
   *
   * @description
   * Synchronously invokes all registered event listeners for a given router lifecycle
   * event in their registration order (FIFO). The method provides critical guarantees:
   * fail-safe execution, state immutability, recursion protection, and iteration safety.
   *
   * @param eventName - The event type to invoke listeners for.
   *                   Must be one of: ROUTER_START, ROUTER_STOP, TRANSITION_START,
   *                   TRANSITION_SUCCESS, TRANSITION_ERROR, TRANSITION_CANCEL.
   *
   * @param toState - Target state for navigation events. Deep frozen before passing.
   *                  Optional for ROUTER_START/STOP, required for TRANSITION_*.
   *
   * @param fromState - Source state for navigation events. Deep frozen before passing.
   *                   Optional for all events (undefined for first navigation).
   *
   * @param arg - Additional event data:
   *             - NavigationOptions for TRANSITION_SUCCESS
   *             - RouterError for TRANSITION_ERROR
   *             - undefined for other events
   *
   * @returns void - Method performs side effects (invokes listeners)
   *
   * @throws {Error} If recursion depth exceeds MAX_DEPTH (5) for the event type
   * @throws {TypeError} If state validation fails (invalid State object structure)
   *
   * @see {@link addEventListener} for subscribing to router events (public API)
   * @see {@link removeEventListener} for unsubscribing from events (public API)
   * @see {@link usePlugin} for plugin-based event handling (recommended)
   */
  invokeEventListeners: (
    eventName: EventToNameMap[EventsKeys],
    toState?: State,
    fromState?: State,
    arg?: RouterError | NavigationOptions,
  ) => void;

  /**
   * Checks if there are any listeners registered for a given event.
   *
   * @internal
   * Used for performance optimization to skip event emission when no listeners exist.
   * This avoids the overhead of argument validation and event dispatch when
   * there are no subscribers.
   *
   * @param eventName - The event type to check for listeners. Must be one of the
   *                   predefined event constants.
   *
   * @returns true if at least one listener is registered for the event, false otherwise.
   *         Returns false for invalid event names instead of throwing.
   *
   * @example
   * ```typescript
   * // Skip expensive event emission if no listeners
   * if (router.hasListeners(events.TRANSITION_ERROR)) {
   *   router.invokeEventListeners(events.TRANSITION_ERROR, toState, fromState, error);
   * }
   * ```
   *
   * @see {@link invokeEventListeners} for the internal event dispatch mechanism
   * @see {@link addEventListener} for registering event listeners
   */
  hasListeners: (eventName: EventToNameMap[EventsKeys]) => boolean;

  /**
   * Removes a previously registered event listener from the router's event system.
   *
   * @internal
   * This is a low-level internal API used primarily by the router core and plugin system.
   * For application code, use the unsubscribe function returned by addEventListener instead.
   *
   * @description
   * Removes a specific event listener callback from the router's event system, preventing it
   * from being invoked on future events. This method is a fundamental part of the subscription
   * lifecycle, ensuring proper cleanup and preventing memory leaks.
   *
   * @param eventName - The event type to remove the listener from. Must be one of the
   *                   predefined event constants (events.ROUTER_START, events.TRANSITION_SUCCESS, etc.).
   *                   TypeScript enforces valid event names at compile time.
   *
   * @param cb - The callback function to remove. Must be the **exact same reference** that was
   *            passed to addEventListener. Using a different function (even with identical code)
   *            will not match and will log a warning.
   *
   * @returns void - No return value (follows DOM API convention). Use the unsubscribe function
   *                from addEventListener if you need guaranteed cleanup confirmation.
   *
   * @throws {Error} If eventName is not a valid event constant
   * @throws {TypeError} If cb is not a function (null, undefined, string, etc.)
   *
   * @see {@link addEventListener} for registering event listeners (returns unsubscribe function)
   * @see {@link usePlugin} for plugin-based event handling (handles cleanup automatically)
   * @see {@link invokeEventListeners} for the internal event dispatch mechanism
   */
  removeEventListener: (
    eventName: EventToNameMap[EventsKeys],
    cb: Plugin[keyof Plugin],
  ) => void;

  /**
   * Registers an event listener for a specific router lifecycle event.
   *
   * @description
   * Provides type-safe subscription to router events with automatic memory leak protection
   * and state immutability guarantees. This is the low-level API for event handling - for
   * most use cases, consider using plugins (usePlugin) or the subscribe method instead.
   *
   * @param eventName - The event type to listen for. Must be one of the predefined
   *                   event constants (events.ROUTER_START, events.TRANSITION_SUCCESS, etc.).
   *                   TypeScript enforces valid event names at compile time.
   *
   * @param cb - The callback function to invoke when the event occurs. Signature must
   *            match the event type. TypeScript enforces correct callback signature.
   *            All State parameters will be deeply frozen before passing.
   *
   * @returns Unsubscribe function that removes the listener. Safe to call multiple times
   *          (subsequent calls log warning but don't throw). Closure captures event and
   *          callback for automatic cleanup.
   *
   * @throws {Error} If the same callback is already registered for this event
   * @throws {Error} If listener count reaches 10000 (hard limit, indicates memory leak)
   * @throws {Error} If eventName is not a valid event constant
   * @throws {TypeError} If callback is not a function
   *
   * @example
   * const unsub = router.addEventListener('TRANSITION_START', (toState, fromState) => {
   *   console.log('Starting navigation:', toState.name)
   * })
   *
   * @example
   * router.addEventListener('TRANSITION_ERROR', (toState, fromState, err) => {
   *   console.error('Navigation failed:', err)
   * })
   *
   * @see {@link usePlugin} for plugin-based event handling (recommended)
   * @see {@link subscribe} for simplified navigation event subscription
   * @see {@link removeEventListener} for manual listener removal (use unsubscribe instead)
   */
  addEventListener: (
    eventName: EventToNameMap[EventsKeys],
    cb: Plugin[keyof Plugin],
  ) => Unsubscribe;

  forward: (fromRoute: string, toRoute: string) => Router<Dependencies>;

  /**
   * Navigates to the specified route.
   *
   * @description
   * Performs a navigation transition from the current route to the target route.
   * The method handles route activation/deactivation lifecycle, middleware execution,
   * and state management. Navigation can be customized with options and supports
   * both synchronous and asynchronous operations.
   *
   * @param routeName - The name of the route to navigate to. Must be a registered route.
   * @param routeParams - Optional parameters to pass to the route. These will be used
   *                      to build the route path and will be available in the route state.
   * @param options - Optional navigation options to control the transition behavior
   * @param done - Optional callback function called when navigation completes or fails.
   *               Receives error as first argument and state as second.
   *
   * @returns A cancel function that can be called to abort the navigation.
   *          Calling cancel will trigger the TRANSITION_CANCELLED event.
   *
   * @example
   * // Simple navigation
   * router.navigate('home');
   *
   * @example
   * // Navigation with parameters
   * router.navigate('user', { id: '123' });
   *
   * @example
   * // Cancellable navigation
   * const cancel = router.navigate('slow-route', {}, {}, (err) => {
   *   if (err?.code === 'CANCELLED') console.log('Navigation was cancelled');
   * });
   * // Later...
   * cancel(); // Abort the navigation
   *
   * @throws {RouterError} With code 'NOT_STARTED' if router is not started
   * @throws {RouterError} With code 'ROUTE_NOT_FOUND' if route doesn't exist
   * @throws {RouterError} With code 'SAME_STATES' if navigating to current route without reload
   * @throws {RouterError} With code 'CANNOT_DEACTIVATE' if canDeactivate guard prevents navigation
   * @throws {RouterError} With code 'CANNOT_ACTIVATE' if canActivate guard prevents navigation
   * @throws {RouterError} With code 'TRANSITION_ERR' if middleware throws an error
   */
  navigate: ((routeName: string) => CancelFn) &
    ((routeName: string, routeParams: Params) => CancelFn) &
    ((routeName: string, done: DoneFn) => CancelFn) &
    ((
      routeName: string,
      routeParams: Params,
      options: NavigationOptions,
    ) => CancelFn) &
    ((routeName: string, routeParams: Params, done: DoneFn) => CancelFn) &
    ((
      routeName: string,
      routeParams: Params,
      options: NavigationOptions,
      done: DoneFn,
    ) => CancelFn);
  /**
   * Navigates to the default route if one is configured.
   *
   * Uses `defaultRoute` and `defaultParams` from router options.
   * Returns no-op if no default route configured.
   *
   * @description
   * Convenience method that navigates to the route specified in router options
   * as `defaultRoute` with `defaultParams`. If no default route is configured,
   * this method does nothing and returns a no-op cancel function.
   *
   * @param opts - Optional navigation options (same as navigate method)
   * @param done - Optional callback function called when navigation completes
   *
   * @returns A cancel function that can be called to abort the navigation.
   *          Returns no-op function if no default route is configured.
   *
   * @see {@link navigate} for detailed behavior and error handling
   */
  navigateToDefault: (() => CancelFn) &
    ((done: DoneFn) => CancelFn) &
    ((opts: NavigationOptions) => CancelFn) &
    ((opts: NavigationOptions, done: DoneFn) => CancelFn);

  /**
   * Internal navigation method that accepts pre-built state.
   *
   * @internal
   * @description
   * This is an internal method used by the router and plugins to perform navigation
   * with a pre-built state object. It should not be used directly by application code.
   * Use `navigate()` instead for normal navigation operations.
   *
   * The method provides control over TRANSITION_SUCCESS event emission through the
   * `emitSuccess` parameter, allowing internal callers to manage event emission
   * themselves to avoid duplicate events.
   *
   * @param toState - The target state to navigate to (pre-built)
   * @param fromState - The current state to navigate from
   * @param opts - Navigation options
   * @param callback - Callback function called when navigation completes
   * @param emitSuccess - Whether to emit TRANSITION_SUCCESS event (false for internal use)
   *
   * @returns A cancel function that can be called to abort the navigation
   *
   * @private
   */
  navigateToState: (
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
    callback: DoneFn,
    emitSuccess: boolean,
  ) => CancelFn;

  /**
   * Subscribes to successful navigation transitions.
   *
   * @description
   * Registers a listener function that will be called whenever a navigation transition
   * completes successfully. This is the primary method for integrating UI frameworks
   * with the router to react to route changes.
   *
   * @param listener - Function called on each successful navigation transition.
   *                   Receives { route, previousRoute } where:
   *                   - route: The new state (frozen/immutable)
   *                   - previousRoute: The previous state (frozen/immutable, undefined on first navigation)
   *
   * @returns Unsubscribe function to remove the listener. Safe to call multiple times.
   *
   * @example
   * // Basic subscription
   * const unsubscribe = router.subscribe(({ route, previousRoute }) => {
   *   console.log(`Navigation: ${previousRoute?.name || 'init'} → ${route.name}`);
   * });
   *
   * // Later, cleanup
   * unsubscribe();
   *
   * @example
   *
   * // Analytics
   * router.subscribe(({ route }) => {
   *   analytics.track('page_view', { path: route.path })
   * })
   *
   * @throws {TypeError} If listener is not a function. Error message includes
   *                     hint about using Symbol.observable for Observable pattern.
   *
   * @see {@link addEventListener} for low-level event subscription
   * @see {@link usePlugin} for subscribing to all router events
   * @see {@link navigate} for triggering navigation
   */
  subscribe: (listener: SubscribeFn) => Unsubscribe;
  // [$$observable]: (listener: Listener) => Subscription;

  /**
   * Creates a clone of this router with the same configuration.
   *
   * @description
   * Creates a new router instance with the same routes, options, middleware,
   * plugins, and lifecycle handlers as the original. The cloned router is
   * independent of the original - changes to one do not affect the other.
   *
   * Use cases:
   * - Server-side rendering (SSR): Create a fresh router for each request
   * - Testing: Clone router to test different scenarios without side effects
   * - Feature flags: Create alternative router configurations
   *
   * What is cloned:
   * - Route tree structure (via rootNode)
   * - Router options (defaultRoute, trailingSlash, etc.)
   * - Middleware factories
   * - Plugin factories
   * - Lifecycle factories (canActivate, canDeactivate)
   * - Config (encoders, decoders, defaultParams, forwardMap)
   *
   * What is NOT cloned:
   * - Current state (cloned router starts fresh)
   * - Event listeners (subscribers must re-register)
   * - Started status (cloned router is not started)
   *
   * @param dependencies - Optional new dependencies for the cloned router.
   *                       If not provided, uses empty dependencies.
   *
   * @returns A new router instance with the same configuration.
   *
   * @example
   * // Basic cloning
   * const router = createRouter(routes, options);
   * const clonedRouter = router.clone();
   *
   * @example
   * // SSR: Clone with request-specific dependencies
   * app.get('*', (req, res) => {
   *   const ssrRouter = router.clone({ request: req });
   *   ssrRouter.start(req.url, (err, state) => {
   *     // Render with state...
   *   });
   * });
   *
   * @example
   * // Testing: Clone for isolated test
   * it('should navigate to user', () => {
   *   const testRouter = router.clone();
   *   testRouter.start();
   *   testRouter.navigate('user', { id: '123' });
   *   expect(testRouter.getState().name).toBe('user');
   * });
   */
  clone: (dependencies?: Dependencies) => Router<Dependencies>;
}

export interface Plugin {
  onStart?: () => void;
  onStop?: () => void;
  onTransitionStart?: (toState: State, fromState?: State) => void;
  onTransitionCancel?: (toState: State, fromState?: State) => void;
  onTransitionError?: (
    toState: State | undefined,
    fromState: State | undefined,
    err: RouterError,
  ) => void;
  onTransitionSuccess?: (
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
  ) => void;
  teardown?: () => void;
}

// eslint-disable-next-line sonarjs/redundant-type-aliases
export type Middleware = ActivationFn;

export type MiddlewareFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
) => Middleware;

export type PluginFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
) => Plugin;

export interface SubscribeState {
  route: State;
  previousRoute?: State | undefined;
}

export type SubscribeFn = (state: SubscribeState) => void;

export interface Listener {
  [key: string]: unknown;
  next: (val: unknown) => void;
  error?: (err: unknown) => void;
  complete?: () => void;
}

export interface Subscription {
  unsubscribe: Unsubscribe;
}
