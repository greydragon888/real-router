// packages/core/src/Router.ts

/**
 * Router class - facade with integrated namespaces.
 *
 * This is Phase 5 of RFC-1 "Fort Knox" architecture.
 * All functionality is now provided by namespace classes.
 */

import { logger } from "@real-router/logger";
import { getSegmentsByName } from "route-tree";
import {
  getTypeDescription,
  isNavigationOptions,
  isParams,
  isString,
  validateRouteName,
  validateState,
} from "type-guards";

import { constants, errorCodes, RouterError } from "@real-router/core";

import {
  CONFIG_SYMBOL,
  RESOLVED_FORWARD_MAP_SYMBOL,
  ROOT_PATH_SYMBOL,
  ROOT_TREE_SYMBOL,
  ROUTE_DEFINITIONS_SYMBOL,
} from "./constants";
import { createRouteState } from "./core/stateBuilder";
import { freezeStateInPlace } from "./helpers";
import {
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
  RouterError as RouterErrorType,
  RouteTreeState,
  SimpleState,
  State,
  StateMetaInput,
  SubscribeFn,
  Unsubscribe,
} from "@real-router/types";
import type { RouteTreeStateMeta } from "route-tree";

/**
 * Extracts URL param names from RouteTreeStateMeta.
 * This is an O(segments × params) operation but avoids tree traversal.
 */
function getUrlParamsFromMeta(meta: RouteTreeStateMeta): string[] {
  const urlParams: string[] = [];

  for (const segmentName in meta) {
    const paramMap = meta[segmentName];

    for (const param in paramMap) {
      if (paramMap[param] === "url") {
        urlParams.push(param);
      }
    }
  }

  return urlParams;
}

/**
 * Compares two parameter values for equality.
 * Supports deep equality for arrays (common in route params like tags, ids).
 */
function areParamValuesEqual(val1: unknown, val2: unknown): boolean {
  if (val1 === val2) {
    return true;
  }

  if (Array.isArray(val1) && Array.isArray(val2)) {
    if (val1.length !== val2.length) {
      return false;
    }

    return val1.every((v, i) => areParamValuesEqual(v, val2[i]));
  }

  return false;
}

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

  // ============================================================================
  // State for state methods (from withState)
  // ============================================================================

  #stateId = 0;
  readonly #urlParamsCache = new Map<string, string[]>();

  // ============================================================================
  // Symbol Accessors (for backward compatibility with tests)
  // ============================================================================

  /* eslint-disable @typescript-eslint/member-ordering -- getter/setter pairs must be adjacent */
  get [CONFIG_SYMBOL](): Config {
    return this.#routes.getConfig() as Config;
  }

  set [CONFIG_SYMBOL](value: Config) {
    this.#routes.setConfig(value);
  }

  get [ROOT_TREE_SYMBOL](): unknown {
    return this.#routes.getTree();
  }

  set [ROOT_TREE_SYMBOL](_value: unknown) {
    // Route tree is managed by RoutesNamespace
    logger.warn(
      "real-router",
      "Direct ROOT_TREE_SYMBOL assignment is deprecated. Use addRoute/removeRoute instead.",
    );
  }

  get [ROUTE_DEFINITIONS_SYMBOL](): unknown {
    return this.#routes.cloneRoutes();
  }

  set [ROUTE_DEFINITIONS_SYMBOL](_value: unknown) {
    logger.warn(
      "real-router",
      "Direct ROUTE_DEFINITIONS_SYMBOL assignment is deprecated.",
    );
  }

  get [ROOT_PATH_SYMBOL](): string {
    return this.#routes.getRootPath();
  }

  set [ROOT_PATH_SYMBOL](value: string) {
    this.#routes.setRootPath(value);
  }

  get [RESOLVED_FORWARD_MAP_SYMBOL](): unknown {
    return this.#routes.getResolvedForwardMap();
  }

  set [RESOLVED_FORWARD_MAP_SYMBOL](value: unknown) {
    this.#routes.setResolvedForwardMap(value as Record<string, string>);
  }
  /* eslint-enable @typescript-eslint/member-ordering */

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

    // Validate all routes before adding
    this.#validateRoutes(routeArray, "");

    this.#routes.addRoutes(routeArray);

    return this;
  }

  removeRoute(name: string): this {
    validateRouteName(name, "removeRoute");
    this.#routes.removeRoute(name);

    return this;
  }

  clearRoutes(): this {
    this.#routes.clearRoutes();

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
    // Validate name (empty string not allowed for updateRoute)
    validateRouteName(name, "updateRoute");

    if (name === "") {
      throw new TypeError(
        `[router.updateRoute] Invalid name: empty string. Cannot update root node.`,
      );
    }

    // Get existing route
    const existingRoute = this.#routes.getRoute(name);

    if (!existingRoute) {
      throw new RouterError(errorCodes.ROUTE_NOT_FOUND, { routeName: name });
    }

    // Validate updates before making any changes (atomic validation)
    // Note: Unlike navigate(), updateRoute accepts class instances and circular refs
    // because defaultParams are stored as-is and only validated when used in navigation
    if (
      updates.defaultParams !== undefined &&
      updates.defaultParams !== null &&
      (typeof updates.defaultParams !== "object" ||
        Array.isArray(updates.defaultParams))
    ) {
      throw new TypeError(
        `[router.updateRoute] defaultParams must be an object, got ${getTypeDescription(updates.defaultParams)}`,
      );
    }

    if (
      updates.forwardTo !== undefined &&
      updates.forwardTo !== null &&
      !this.#routes.hasRoute(updates.forwardTo)
    ) {
      throw new Error(
        `[router.updateRoute] forwardTo target "${updates.forwardTo}" does not exist`,
      );
    }

    // Remove old route and add updated one
    this.#routes.removeRoute(name);

    // Build updated route, filtering out null/undefined values
    const merged = { ...existingRoute, ...updates, name };
    const updatedRoute: Route<Dependencies> = {
      name: merged.name,
      path: merged.path,
    };

    // Copy optional properties if defined and not null
    if (merged.children) {
      updatedRoute.children = merged.children;
    }
    if (merged.forwardTo) {
      updatedRoute.forwardTo = merged.forwardTo;
    }
    if (merged.defaultParams) {
      updatedRoute.defaultParams = merged.defaultParams;
    }
    if (merged.decodeParams) {
      updatedRoute.decodeParams = merged.decodeParams;
    }
    if (merged.encodeParams) {
      updatedRoute.encodeParams = merged.encodeParams;
    }
    if (merged.canActivate) {
      updatedRoute.canActivate = merged.canActivate;
    }

    this.#routes.addRoutes([updatedRoute]);

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
    // Validate name - non-string throws
    if (!isString(name)) {
      throw new TypeError(`Route name must be a string`);
    }

    // Empty string is special case - warn and return false (root node is not a parent)
    if (name === "") {
      logger.warn(
        "real-router",
        'isActiveRoute("") called with empty string. Root node is not considered a parent of any route.',
      );

      return false;
    }

    // Validate params if provided
    if (params !== undefined && !isParams(params)) {
      throw new TypeError(`[router.isActiveRoute] Invalid params structure`);
    }

    // Validate strictEquality if provided (use typeof for test compatibility)
    if (strictEquality !== undefined && typeof strictEquality !== "boolean") {
      throw new TypeError(
        `[router.isActiveRoute] strictEquality must be a boolean, got ${typeof strictEquality}`,
      );
    }

    // Validate ignoreQueryParams if provided (use typeof for test compatibility)
    if (
      ignoreQueryParams !== undefined &&
      typeof ignoreQueryParams !== "boolean"
    ) {
      throw new TypeError(
        `[router.isActiveRoute] ignoreQueryParams must be a boolean, got ${typeof ignoreQueryParams}`,
      );
    }

    return this.#routes.isActiveRoute(
      name,
      params,
      strictEquality,
      ignoreQueryParams,
    );
  }

  buildPath(route: string, params?: Params): string {
    return this.#routes.buildPath(route, params, this.#options.get());
  }

  buildPathWithSegments(
    route: string,
    params: Params,
    _segments: readonly unknown[],
  ): string {
    // Note: segments parameter is kept for API compatibility but not used
    // because RoutesNamespace.buildPath handles segment lookup internally
    return this.#routes.buildPath(route, params, this.#options.get());
  }

  matchPath<P extends Params = Params, MP extends Params = Params>(
    path: string,
    source?: string,
  ): State<P, MP> | undefined {
    return this.#routes.matchPath<P, MP>(path, source, this.#options.get());
  }

  setRootPath(rootPath: string): void {
    this.#routes.setRootPath(rootPath);
  }

  getRootPath(): string {
    return this.#routes.getRootPath();
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
    // Validate name is a string
    if (!isString(name)) {
      throw new TypeError(
        `[router.makeState] Invalid name: ${getTypeDescription(name)}. Expected string.`,
      );
    }

    // Validate params if provided
    if (params !== undefined && !isParams(params)) {
      throw new TypeError(
        `[router.makeState] Invalid params: ${getTypeDescription(params)}. Expected plain object.`,
      );
    }

    // Validate path if provided
    if (path !== undefined && !isString(path)) {
      throw new TypeError(
        `[router.makeState] Invalid path: ${getTypeDescription(path)}. Expected string.`,
      );
    }

    // Validate forceId if provided
    if (forceId !== undefined && typeof forceId !== "number") {
      throw new TypeError(
        `[router.makeState] Invalid forceId: ${getTypeDescription(forceId)}. Expected number.`,
      );
    }

    const madeMeta = meta
      ? {
          ...meta,
          id: forceId ?? ++this.#stateId,
          params: meta.params,
          options: meta.options,
          redirected: meta.redirected,
        }
      : undefined;

    // Get default params from routes config
    const config = this.#routes.getConfig();
    const hasDefaultParams = Object.hasOwn(config.defaultParams, name);

    let mergedParams: P;

    if (hasDefaultParams) {
      mergedParams = { ...config.defaultParams[name], ...params } as P;
    } else if (params) {
      mergedParams = { ...params };
    } else {
      mergedParams = {} as P;
    }

    const state: State<P, MP> = {
      name,
      params: mergedParams,
      path: path ?? this.buildPath(name, params),
      meta: madeMeta,
    };

    return freezeStateInPlace(state);
  }

  makeNotFoundState(path: string, options?: NavigationOptions): State {
    if (!isString(path)) {
      throw new TypeError(
        `[router.makeNotFoundState] Invalid path: ${getTypeDescription(path)}. Expected string.`,
      );
    }

    if (options !== undefined && !isNavigationOptions(options)) {
      throw new TypeError(
        `[router.makeNotFoundState] Invalid options: ${getTypeDescription(options)}. Expected NavigationOptions object.`,
      );
    }

    return this.makeState<{ path: string }>(
      constants.UNKNOWN_ROUTE,
      { path },
      path,
      options
        ? {
            options,
            params: {},
            redirected: false,
          }
        : undefined,
    );
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
    if (!state1 || !state2) {
      return !!state1 === !!state2;
    }

    if (state1.name !== state2.name) {
      return false;
    }

    if (ignoreQueryParams) {
      const stateMeta = (state1.meta?.params ?? state2.meta?.params) as
        | RouteTreeStateMeta
        | undefined;

      const urlParams = stateMeta
        ? getUrlParamsFromMeta(stateMeta)
        : this.#getUrlParams(state1.name);

      return urlParams.every((param) =>
        areParamValuesEqual(state1.params[param], state2.params[param]),
      );
    }

    const state1Keys = Object.keys(state1.params);
    const state2Keys = Object.keys(state2.params);

    if (state1Keys.length !== state2Keys.length) {
      return false;
    }

    return state1Keys.every(
      (param) =>
        param in state2.params &&
        areParamValuesEqual(state1.params[param], state2.params[param]),
    );
  }

  areStatesDescendants(parentState: State, childState: State): boolean {
    validateState(parentState, "areStatesDescendants");
    validateState(childState, "areStatesDescendants");

    logger.warn(
      "real-router",
      "areStatesDescendants is deprecated and will be removed in the next major version. " +
        "Use router.isActiveRoute() instead.",
    );

    const parentPrefix = `${parentState.name}.`;

    if (!childState.name.startsWith(parentPrefix)) {
      return false;
    }

    return Object.keys(parentState.params).every((p) =>
      areParamValuesEqual(parentState.params[p], childState.params[p]),
    );
  }

  forwardState<P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ): SimpleState<P> {
    if (!isString(routeName)) {
      throw new TypeError(
        `[router.forwardState] Invalid routeName: ${getTypeDescription(routeName)}. Expected string.`,
      );
    }

    if (!isParams(routeParams)) {
      throw new TypeError(
        `[router.forwardState] Invalid routeParams: ${getTypeDescription(routeParams)}. Expected plain object.`,
      );
    }

    return this.#routes.forwardState<P>(routeName, routeParams);
  }

  buildState(
    routeName: string,
    routeParams: Params,
  ): RouteTreeState | undefined {
    if (!isString(routeName)) {
      throw new TypeError(
        `[router.buildState] Invalid routeName: ${getTypeDescription(routeName)}. Expected string.`,
      );
    }

    if (!isParams(routeParams)) {
      throw new TypeError(
        `[router.buildState] Invalid routeParams: ${getTypeDescription(routeParams)}. Expected plain object.`,
      );
    }

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
    if (!isString(routeName)) {
      throw new TypeError(
        `[router.buildStateWithSegments] Invalid routeName: ${getTypeDescription(routeName)}. Expected string.`,
      );
    }

    if (!isParams(routeParams)) {
      throw new TypeError(
        `[router.buildStateWithSegments] Invalid routeParams: ${getTypeDescription(routeParams)}. Expected plain object.`,
      );
    }

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
    return this.#routes.shouldUpdateNode(nodeName);
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
    return this.#lifecycle.isStarted();
  }

  isActive(): boolean {
    return this.#lifecycle.isActive();
  }

  isNavigating(): boolean {
    return this.#navigation.isNavigating();
  }

  start(startPathOrState?: string | State | DoneFn, done?: DoneFn): this {
    // Lock options when router starts
    this.#options.lock();

    // Initialize build options cache
    this.#routes.initBuildOptionsCache(this.#options.get());

    if (typeof startPathOrState === "function") {
      this.#lifecycle.start(startPathOrState);
    } else if (startPathOrState !== undefined && done !== undefined) {
      this.#lifecycle.start(startPathOrState, done);
    } else if (startPathOrState === undefined) {
      this.#lifecycle.start();
    } else {
      this.#lifecycle.start(startPathOrState);
    }

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
    arg?: RouterErrorType | NavigationOptions,
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
    // Validate inputs
    if (!isString(fromRoute) || fromRoute === "") {
      throw new TypeError(
        `[router.forward] Invalid fromRoute: ${getTypeDescription(fromRoute)}. Expected non-empty string.`,
      );
    }

    if (!isString(toRoute) || toRoute === "") {
      throw new TypeError(
        `[router.forward] Invalid toRoute: ${getTypeDescription(toRoute)}. Expected non-empty string.`,
      );
    }

    // Get config and add forward mapping
    const config = this.#routes.getConfig();

    config.forwardMap[fromRoute] = toRoute;

    // Rebuild resolved forward map
    const resolvedMap = this.#routes.getResolvedForwardMap();

    // Resolve chain: follow forwardTo until we find terminal route
    const current = fromRoute;
    let target = toRoute;
    const visited = new Set<string>([current]);

    while (config.forwardMap[target]) {
      if (visited.has(target)) {
        throw new Error(
          `[router.forward] Circular forward detected: ${fromRoute} -> ${target}`,
        );
      }

      visited.add(target);
      target = config.forwardMap[target];
    }

    resolvedMap[fromRoute] = target;

    return this;
  }

  navigate(
    routeName: string,
    routeParamsOrDone?: Params | DoneFn,
    optionsOrDone?: NavigationOptions | DoneFn,
    done?: DoneFn,
  ): CancelFn {
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
    return this.#navigation.navigateToDefault(optsOrDone, done);
  }

  navigateToState(
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
    callback: DoneFn,
    emitSuccess: boolean,
  ): CancelFn {
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
    // Create new router with same options and routes
    const clonedRoutes = this.#routes.cloneRoutes();
    const clonedOptions = { ...this.#options.get() };
    const mergedDeps = {
      ...this.#dependencies.getAll(),
      ...dependencies,
    } as Dependencies;

    const newRouter = new Router<Dependencies>(
      clonedRoutes,
      clonedOptions,
      mergedDeps,
    );

    // Copy lifecycle factories
    const [canDeactivateFactories, canActivateFactories] =
      this.#routeLifecycle.getFactories();

    for (const [name, factory] of Object.entries(canDeactivateFactories)) {
      newRouter.canDeactivate(name, factory);
    }

    for (const [name, factory] of Object.entries(canActivateFactories)) {
      newRouter.canActivate(name, factory);
    }

    // Copy middleware factories
    const middlewareFactories = this.#middleware.getFactories();

    if (middlewareFactories.length > 0) {
      newRouter.useMiddleware(...middlewareFactories);
    }

    // Copy plugin factories
    const pluginFactories = this.#plugins.getAll();

    if (pluginFactories.length > 0) {
      newRouter.usePlugin(...pluginFactories);
    }

    // Copy config (decoders, encoders, defaultParams, forwardMap)
    const config = this.#routes.getConfig();
    const newConfig = newRouter.#routes.getConfig();

    Object.assign(newConfig.decoders, config.decoders);
    Object.assign(newConfig.encoders, config.encoders);
    Object.assign(newConfig.defaultParams, config.defaultParams);
    Object.assign(newConfig.forwardMap, config.forwardMap);

    // Copy resolved forward map
    const resolvedForwardMap = this.#routes.getResolvedForwardMap();

    newRouter.#routes.setResolvedForwardMap({ ...resolvedForwardMap });

    return newRouter as unknown as RouterInterface<Dependencies>;
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

    this.#routes.setRouter(routerRef);
    this.#routes.setLifecycleNamespace(this.#routeLifecycle);
    this.#routeLifecycle.setRouter(routerRef);
    this.#middleware.setRouter(routerRef);
    this.#plugins.setRouter(routerRef);
    this.#navigation.setRouter(routerRef);
    this.#lifecycle.setRouter(routerRef);

    // Observable needs access to state for replay feature
    this.#observable.setGetState(() => this.getState());

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
  }

  #getUrlParams(name: string): string[] {
    const cached = this.#urlParamsCache.get(name);

    if (cached !== undefined) {
      return cached;
    }

    const segments = getSegmentsByName(this.#routes.getTree(), name);

    if (!segments) {
      this.#urlParamsCache.set(name, []);

      return [];
    }

    const result = segments.flatMap((segment) =>
      segment.parser ? segment.parser.urlParams : [],
    );

    this.#urlParamsCache.set(name, result);

    return result;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Validates routes before adding them to the router.
   * Performs recursive validation of nested routes.
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity -- validation logic is naturally verbose
  #validateRoutes(
    routes: Route<Dependencies>[],
    parentPrefix: string,
    batchNames = new Set<string>(),
  ): void {
    for (const route of routes) {
      // Check route is an object (runtime defense against `as any` casts)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime validation
      if (route === null || typeof route !== "object" || Array.isArray(route)) {
        throw new TypeError(
          `[router.addRoute] Route must be an object, got ${getTypeDescription(route)}`,
        );
      }

      // Check required properties
      if (!isString(route.name) || route.name === "") {
        throw new TypeError(
          `[router.addRoute] Route name must be a non-empty string, got ${getTypeDescription(route.name)}`,
        );
      }

      if (!isString(route.path)) {
        throw new TypeError(
          `[router.addRoute] Route path must be a string for route "${route.name}", got ${getTypeDescription(route.path)}`,
        );
      }

      const fullName = parentPrefix
        ? `${parentPrefix}.${route.name}`
        : route.name;

      // Check for duplicates in existing routes
      if (this.#routes.hasRoute(fullName)) {
        throw new Error(
          `[router.addRoute] Route "${fullName}" already exists. Use updateRoute() to modify.`,
        );
      }

      // Check for duplicates within the batch
      if (batchNames.has(fullName)) {
        throw new Error(
          `[router.addRoute] Duplicate route name "${fullName}" in batch.`,
        );
      }

      batchNames.add(fullName);

      // Validate children is an array
      if (route.children !== undefined && !Array.isArray(route.children)) {
        throw new TypeError(
          `[router.addRoute] Route "${fullName}" children must be an array, got ${getTypeDescription(route.children)}`,
        );
      }

      // Validate canActivate is a function
      if (
        route.canActivate !== undefined &&
        typeof route.canActivate !== "function"
      ) {
        throw new TypeError(
          `[router.addRoute] canActivate must be a function for route "${fullName}", got ${getTypeDescription(route.canActivate)}`,
        );
      }

      // Validate canDeactivate is a function
      if (
        route.canDeactivate !== undefined &&
        typeof route.canDeactivate !== "function"
      ) {
        throw new TypeError(
          `[router.addRoute] canDeactivate must be a function for route "${fullName}", got ${getTypeDescription(route.canDeactivate)}`,
        );
      }

      // Validate defaultParams is an object (allow class instances, etc.)
      if (
        route.defaultParams !== undefined &&
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime validation for `as any` casts
        route.defaultParams !== null &&
        (typeof route.defaultParams !== "object" ||
          Array.isArray(route.defaultParams))
      ) {
        throw new TypeError(
          `[router.addRoute] defaultParams must be an object for route "${fullName}", got ${getTypeDescription(route.defaultParams)}`,
        );
      }

      // Validate decodeParams is a function
      if (
        route.decodeParams !== undefined &&
        typeof route.decodeParams !== "function"
      ) {
        throw new TypeError(
          `[router.addRoute] decodeParams must be a function for route "${fullName}", got ${getTypeDescription(route.decodeParams)}`,
        );
      }

      // Validate encodeParams is a function
      if (
        route.encodeParams !== undefined &&
        typeof route.encodeParams !== "function"
      ) {
        throw new TypeError(
          `[router.addRoute] encodeParams must be a function for route "${fullName}", got ${getTypeDescription(route.encodeParams)}`,
        );
      }

      // Recursively validate children
      if (route.children) {
        this.#validateRoutes(route.children, fullName, batchNames);
      }
    }
  }
}
