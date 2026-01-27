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

import { constants } from "@real-router/core";

import {
  CONFIG_SYMBOL,
  RESOLVED_FORWARD_MAP_SYMBOL,
  ROOT_PATH_SYMBOL,
  ROOT_TREE_SYMBOL,
  ROUTE_DEFINITIONS_SYMBOL,
} from "./constants";
import { resolveForwardChain } from "./core/routes/routeConfig";
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
import type { RouteTree, RouteTreeStateMeta } from "route-tree";

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
 * Pattern for complete route validation (all segments at once).
 * Matches: single segment or multiple segments separated by dots.
 * Each segment must start with letter/underscore, followed by alphanumeric/hyphen/underscore.
 * Rejects: leading/trailing/consecutive dots, segments starting with numbers/hyphens.
 */
const FULL_ROUTE_PATTERN = /^[A-Z_a-z][\w-]*(?:\.[A-Z_a-z][\w-]*)*$/;

/**
 * Extracts parameter names from a single path string.
 * Matches :param and *splat patterns.
 */
function extractParamsFromPath(path: string): Set<string> {
  const params = new Set<string>();
  const paramRegex = /[*:]([A-Z_a-z]\w*)/g;
  let match;

  while ((match = paramRegex.exec(path)) !== null) {
    params.add(match[1]);
  }

  return params;
}

/**
 * Extracts all parameters from multiple path segments.
 */
function extractParamsFromPaths(paths: readonly string[]): Set<string> {
  const params = new Set<string>();

  for (const path of paths) {
    for (const param of extractParamsFromPath(path)) {
      params.add(param);
    }
  }

  return params;
}

/**
 * Collects all path segments for a route from batch definitions.
 * Traverses parent routes to include inherited path segments.
 */
function collectPathsToRoute<Dependencies extends DefaultDependencies>(
  routes: readonly Route<Dependencies>[],
  routeName: string,
  parentName = "",
  paths: string[] = [],
): string[] | undefined {
  for (const route of routes) {
    const fullName = parentName ? `${parentName}.${route.name}` : route.name;
    const currentPaths = [...paths, route.path];

    if (fullName === routeName) {
      return currentPaths;
    }

    if (route.children && routeName.startsWith(`${fullName}.`)) {
      const result = collectPathsToRoute(
        route.children,
        routeName,
        fullName,
        currentPaths,
      );

      if (result) {
        return result;
      }
    }
  }

  return undefined;
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
    return this.#routes.getDefinitions();
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

    // Check if trying to remove currently active route (or its parent)
    const currentState = this.#state.get();

    if (currentState) {
      const currentName = currentState.name;
      const isExactMatch = currentName === name;
      const isParentOfCurrent = currentName.startsWith(`${name}.`);

      if (isExactMatch || isParentOfCurrent) {
        const suffix = isExactMatch ? "" : ` (current: "${currentName}")`;

        logger.warn(
          "router.removeRoute",
          `Cannot remove route "${name}" — it is currently active${suffix}. Navigate away first.`,
        );

        return this;
      }
    }

    // Warn if navigation is in progress
    if (this.#navigation.isNavigating()) {
      logger.warn(
        "router.removeRoute",
        `Route "${name}" removed while navigation is in progress. This may cause unexpected behavior.`,
      );
    }

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
    // Block if navigation is in progress
    if (this.#navigation.isNavigating()) {
      logger.error(
        "router.clearRoutes",
        "Cannot clear routes while navigation is in progress. Wait for navigation to complete.",
      );

      return this;
    }

    // Clear routes config (definitions, decoders, encoders, defaultParams, forwardMap)
    this.#routes.clearRoutes();

    // Clear all lifecycle handlers
    const [canDeactivateFactories, canActivateFactories] =
      this.#routeLifecycle.getFactories();

    for (const name in canActivateFactories) {
      this.#routeLifecycle.clearCanActivate(name, true);
    }

    for (const name in canDeactivateFactories) {
      this.#routeLifecycle.clearCanDeactivate(name, true);
    }

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

  // eslint-disable-next-line sonarjs/cognitive-complexity -- validation logic is naturally verbose
  updateRoute(name: string, updates: RouteConfigUpdate<Dependencies>): this {
    // Validate name (empty string not allowed for updateRoute)
    validateRouteName(name, "updateRoute");

    if (name === "") {
      throw new ReferenceError(
        `[router.updateRoute] Invalid name: empty string. Cannot update root node.`,
      );
    }

    // Warn if navigation is in progress
    if (this.#navigation.isNavigating()) {
      logger.error(
        "router.updateRoute",
        `Updating route "${name}" while navigation is in progress. This may cause unexpected behavior.`,
      );
    }

    // Validate updates object type (runtime defense against `as any` casts)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime validation
    if (updates === null) {
      throw new TypeError(
        `[real-router] updateRoute: updates must be an object, got null`,
      );
    }

    if (typeof updates !== "object" || Array.isArray(updates)) {
      throw new TypeError(
        `[real-router] updateRoute: updates must be an object, got ${getTypeDescription(updates)}`,
      );
    }

    // Get existing route
    const existingRoute = this.#routes.getRoute(name);

    if (!existingRoute) {
      throw new ReferenceError(
        `[real-router] updateRoute: route "${name}" does not exist`,
      );
    }

    // Cache all property values upfront to protect against mutating getters
    // This ensures consistent behavior regardless of getter side effects
    const {
      forwardTo,
      defaultParams,
      decodeParams,
      encodeParams,
      canActivate,
    } = updates;

    // ============================================================
    // PHASE 1: VALIDATION (all validations before any mutations)
    // This ensures atomicity - either all updates apply or none do
    // ============================================================

    // Validate forwardTo (check target exists and no cycles)
    if (forwardTo !== undefined && forwardTo !== null) {
      if (!this.#routes.hasRoute(forwardTo)) {
        throw new Error(
          `[real-router] updateRoute: forwardTo target "${forwardTo}" does not exist`,
        );
      }

      // Check forwardTo param compatibility
      this.#validateForwardToParamCompatibility(name, forwardTo);

      // Check for cycle detection
      this.#validateForwardToCycle(name, forwardTo);
    }

    // Validate defaultParams
    if (
      defaultParams !== undefined &&
      defaultParams !== null &&
      (typeof defaultParams !== "object" || Array.isArray(defaultParams))
    ) {
      throw new TypeError(
        `[real-router] updateRoute: defaultParams must be an object or null, got ${getTypeDescription(defaultParams)}`,
      );
    }

    // Validate decodeParams
    if (decodeParams !== undefined && decodeParams !== null) {
      if (typeof decodeParams !== "function") {
        throw new TypeError(
          `[real-router] updateRoute: decodeParams must be a function or null, got ${typeof decodeParams}`,
        );
      }
      // Check for async function
      if (
        decodeParams.constructor.name === "AsyncFunction" ||
        decodeParams.toString().includes("__awaiter")
      ) {
        throw new TypeError(
          `[real-router] updateRoute: decodeParams cannot be an async function`,
        );
      }
    }

    // Validate encodeParams
    if (encodeParams !== undefined && encodeParams !== null) {
      if (typeof encodeParams !== "function") {
        throw new TypeError(
          `[real-router] updateRoute: encodeParams must be a function or null, got ${typeof encodeParams}`,
        );
      }
      // Check for async function
      if (
        encodeParams.constructor.name === "AsyncFunction" ||
        encodeParams.toString().includes("__awaiter")
      ) {
        throw new TypeError(
          `[real-router] updateRoute: encodeParams cannot be an async function`,
        );
      }
    }

    // ============================================================
    // PHASE 2: MUTATION (all mutations after validations pass)
    // ============================================================

    // Update route config directly without removing/adding
    // This preserves other routes' forwardMap references
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

    // Get default params from routes config, including ancestor routes
    const config = this.#routes.getConfig();

    // Collect defaultParams from all ancestors (parent.child -> parent, parent.child)
    const segments = name.split(".");
    let mergedParams: P = {} as P;

    // Build up ancestor names and merge their defaultParams
    for (let i = 1; i <= segments.length; i++) {
      const ancestorName = segments.slice(0, i).join(".");

      if (Object.hasOwn(config.defaultParams, ancestorName)) {
        mergedParams = {
          ...mergedParams,
          ...config.defaultParams[ancestorName],
        } as P;
      }
    }

    // Finally merge with provided params (highest priority)
    if (params) {
      mergedParams = { ...mergedParams, ...params };
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

  start(
    ...args:
      | []
      | [done: DoneFn]
      | [startPathOrState: string | State]
      | [startPathOrState: string | State, done: DoneFn]
  ): this {
    // Lock options when router starts
    this.#options.lock();

    // Initialize build options cache
    this.#routes.initBuildOptionsCache(this.#options.get());

    // Forward all arguments to lifecycle for validation (including arg count check)
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

  // eslint-disable-next-line sonarjs/cognitive-complexity -- param validation requires nested checks
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

    // Validate source route exists
    if (!this.#routes.hasRoute(fromRoute)) {
      throw new Error(
        `[real-router] forward: source route "${fromRoute}" does not exist`,
      );
    }

    // Validate target route exists
    if (!this.#routes.hasRoute(toRoute)) {
      throw new Error(
        `[real-router] forward: target route "${toRoute}" does not exist`,
      );
    }

    // Validate param compatibility
    const fromSegments = getSegmentsByName(this.#routes.getTree(), fromRoute);
    const toSegments = getSegmentsByName(this.#routes.getTree(), toRoute);

    if (fromSegments && toSegments) {
      // Get source URL params
      const fromParams = new Set<string>();

      for (const segment of fromSegments) {
        if (segment.parser) {
          for (const param of segment.parser.urlParams) {
            fromParams.add(param);
          }
        }
      }

      // Check target params against source
      const missingParams: string[] = [];

      for (const segment of toSegments) {
        if (segment.parser) {
          for (const param of segment.parser.urlParams) {
            if (!fromParams.has(param)) {
              missingParams.push(param);
            }
          }
        }
      }

      if (missingParams.length > 0) {
        throw new Error(
          `[real-router] forward: target route "${toRoute}" requires params [${missingParams.join(", ")}] that are not available in source route "${fromRoute}"`,
        );
      }
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
   * Collects all route names from a batch recursively (for cross-reference validation).
   */
  #collectRouteNames(
    routes: Route<Dependencies>[],
    parentPrefix: string,
    names: Set<string>,
  ): void {
    for (const route of routes) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime check
      if (route && typeof route === "object" && isString(route.name)) {
        const fullName = parentPrefix
          ? `${parentPrefix}.${route.name}`
          : route.name;

        names.add(fullName);

        if (route.children && Array.isArray(route.children)) {
          this.#collectRouteNames(route.children, fullName, names);
        }
      }
    }
  }

  /**
   * Validates routes before adding them to the router.
   * Performs recursive validation of nested routes.
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity -- validation logic is naturally verbose
  #validateRoutes(
    routes: Route<Dependencies>[],
    parentPrefix: string,
    batchNames?: Set<string>,
    processedNames?: Set<string>,
    seenPathsByParent?: Map<string, Set<string>>,
    topLevelBatch?: Route<Dependencies>[],
  ): void {
    // On first call (top-level), pre-collect all route names for cross-reference validation
    // and store the top-level batch for forwardTo param validation
    if (batchNames === undefined) {
      batchNames = new Set<string>();
      this.#collectRouteNames(routes, parentPrefix, batchNames);
      topLevelBatch = routes;
    }

    // Track processed names for duplicate detection within batch
    processedNames ??= new Set<string>();

    // Track paths per parent for duplicate path detection
    seenPathsByParent ??= new Map<string, Set<string>>();

    for (const route of routes) {
      // Check route is an object (runtime defense against `as any` casts)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime validation
      if (route === null || typeof route !== "object" || Array.isArray(route)) {
        throw new TypeError(
          `[router.addRoute] Route must be an object, got ${getTypeDescription(route)}`,
        );
      }

      // Check route is a plain object (no getters, setters, or class instances)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Object.getPrototypeOf returns unknown
      const proto: object | null = Object.getPrototypeOf(route);

      if (proto !== null && proto !== Object.prototype) {
        throw new TypeError(
          `[router.addRoute] Route must be a plain object. Class instances are not allowed.`,
        );
      }

      // Check for getters/setters on route object
      const descriptors = Object.getOwnPropertyDescriptors(route);

      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (descriptor.get || descriptor.set) {
          throw new TypeError(
            `[router.addRoute] Route must not have getters or setters. Found "${key}" with ${descriptor.get ? "getter" : "setter"}.`,
          );
        }
      }

      // Check required properties
      if (!isString(route.name)) {
        throw new TypeError(
          `[router.addRoute] Route name must be a string, got ${getTypeDescription(route.name)}`,
        );
      }

      if (route.name === "") {
        throw new TypeError(`[router.addRoute] Route name cannot be empty`);
      }

      // System routes bypass pattern validation (e.g., @@router/UNKNOWN_ROUTE)
      if (
        !route.name.startsWith("@@") &&
        !FULL_ROUTE_PATTERN.test(route.name)
      ) {
        throw new TypeError(
          `[router.addRoute] Invalid route name "${route.name}". ` +
            `Each segment must start with a letter or underscore, ` +
            `followed by letters, numbers, underscores, or hyphens. ` +
            `Segments are separated by dots (e.g., "users.profile").`,
        );
      }

      if (!isString(route.path)) {
        throw new TypeError(
          `[router.addRoute] Route path must be a string for route "${route.name}", got ${getTypeDescription(route.path)}`,
        );
      }

      // Check for whitespace in path
      if (/\s/.test(route.path)) {
        throw new Error(
          `[router.addRoute] Route path "${route.path}" contains whitespace; whitespace not allowed in paths.`,
        );
      }

      const fullName = parentPrefix
        ? `${parentPrefix}.${route.name}`
        : route.name;

      // Check for duplicates in existing routes (name check first)
      if (this.#routes.hasRoute(fullName)) {
        throw new Error(
          `[router.addRoute] Route "${fullName}" already exists. Use updateRoute() to modify.`,
        );
      }

      // Check for duplicates within the batch (using processedNames, not batchNames)
      if (processedNames.has(fullName)) {
        throw new Error(
          `[router.addRoute] Duplicate route "${fullName}" in batch`,
        );
      }

      processedNames.add(fullName);

      // Check for duplicate paths in existing tree at same parent level
      const rootNode = this.#routes.getTree();
      let parentNode: RouteTree | undefined = rootNode;

      if (parentPrefix !== "") {
        const segments = parentPrefix.split(".");

        for (const segment of segments) {
          parentNode = parentNode.childrenByName.get(segment);

          if (!parentNode) {
            break; // Parent doesn't exist in tree yet
          }
        }
      }

      if (parentNode) {
        for (const child of parentNode.children) {
          if (child.path === route.path) {
            throw new Error(
              `[router.addRoute] Path "${route.path}" is already defined`,
            );
          }
        }
      }

      // Check for duplicate paths within current batch at same parent level
      const pathsAtLevel = seenPathsByParent.get(parentPrefix) ?? new Set();

      if (pathsAtLevel.has(route.path)) {
        throw new Error(
          `[router.addRoute] Path "${route.path}" is already defined`,
        );
      }

      pathsAtLevel.add(route.path);
      seenPathsByParent.set(parentPrefix, pathsAtLevel);

      // Validate dot-notation parent exists (for top-level routes with dots)
      if (parentPrefix === "" && fullName.includes(".")) {
        const parentName = fullName.slice(
          0,
          Math.max(0, fullName.lastIndexOf(".")),
        );

        // Parent must exist either in router or already processed in this batch
        // Using processedNames (not batchNames) to detect parent-after-child order errors
        if (
          !this.#routes.hasRoute(parentName) &&
          !processedNames.has(parentName)
        ) {
          throw new Error(
            `[router.addRoute] Parent route "${parentName}" does not exist. Add the parent route first.`,
          );
        }
      }

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

      // Validate defaultParams is an object (null not allowed in addRoute)
      if (
        route.defaultParams !== undefined &&
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime validation for JS callers
        (route.defaultParams === null ||
          typeof route.defaultParams !== "object" ||
          Array.isArray(route.defaultParams))
      ) {
        throw new TypeError(
          `[router.addRoute] defaultParams must be an object for route "${fullName}", got ${getTypeDescription(route.defaultParams)}`,
        );
      }

      // Validate decodeParams is a function (and not async)
      if (route.decodeParams !== undefined) {
        if (typeof route.decodeParams !== "function") {
          throw new TypeError(
            `[router.addRoute] decodeParams must be a function for route "${fullName}", got ${getTypeDescription(route.decodeParams)}`,
          );
        }

        if (route.decodeParams.constructor.name === "AsyncFunction") {
          throw new TypeError(
            `[router.addRoute] decodeParams cannot be async for route "${fullName}". Async functions break matchPath/buildPath.`,
          );
        }
      }

      // Validate encodeParams is a function (and not async)
      if (route.encodeParams !== undefined) {
        if (typeof route.encodeParams !== "function") {
          throw new TypeError(
            `[router.addRoute] encodeParams must be a function for route "${fullName}", got ${getTypeDescription(route.encodeParams)}`,
          );
        }

        if (route.encodeParams.constructor.name === "AsyncFunction") {
          throw new TypeError(
            `[router.addRoute] encodeParams cannot be async for route "${fullName}". Async functions break matchPath/buildPath.`,
          );
        }
      }

      // Validate forwardTo target exists and param compatibility
      if (route.forwardTo !== undefined) {
        const targetExists =
          this.#routes.hasRoute(route.forwardTo) ||
          batchNames.has(route.forwardTo);

        if (!targetExists) {
          throw new Error(
            `[router.addRoute] forwardTo target "${route.forwardTo}" does not exist for route "${fullName}"`,
          );
        }

        // Validate param compatibility - target can't require params source doesn't have
        const targetSegments = getSegmentsByName(
          this.#routes.getTree(),
          route.forwardTo,
        );

        // Get target's required params - either from tree or from batch
        let targetParams: Set<string>;

        if (targetSegments) {
          // Target exists in tree
          targetParams = new Set<string>();

          for (const segment of targetSegments) {
            if (segment.parser) {
              for (const param of segment.parser.urlParams) {
                targetParams.add(param);
              }
            }
          }
        } else if (topLevelBatch) {
          // Target is in batch - extract params from batch route definitions
          const targetPaths = collectPathsToRoute(
            topLevelBatch,
            route.forwardTo,
          );

          targetParams = targetPaths
            ? extractParamsFromPaths(targetPaths)
            : new Set<string>();
        } else {
          targetParams = new Set<string>();
        }

        // Get source's params - from current route and all ancestors
        let sourceParams: Set<string>;

        if (topLevelBatch) {
          // Get all paths from root to source in batch
          const sourcePaths = collectPathsToRoute(topLevelBatch, fullName);

          sourceParams = sourcePaths
            ? extractParamsFromPaths(sourcePaths)
            : new Set<string>();
        } else {
          // Fallback: extract from current path and tree ancestors
          sourceParams = extractParamsFromPath(route.path);

          if (parentPrefix !== "") {
            const parentSegments = getSegmentsByName(
              this.#routes.getTree(),
              parentPrefix,
            );

            if (parentSegments) {
              for (const segment of parentSegments) {
                if (segment.parser) {
                  for (const param of segment.parser.urlParams) {
                    sourceParams.add(param);
                  }
                }
              }
            }
          }
        }

        // Check for missing params
        const missingParams = [...targetParams].filter(
          (param) => !sourceParams.has(param),
        );

        if (missingParams.length > 0) {
          throw new Error(
            `[router.addRoute] forwardTo target "${route.forwardTo}" requires params [${missingParams.join(", ")}] that are not available in source route "${fullName}"`,
          );
        }
      }

      // Recursively validate children
      if (route.children) {
        this.#validateRoutes(
          route.children,
          fullName,
          batchNames,
          processedNames,
          seenPathsByParent,
          topLevelBatch,
        );
      }
    }

    // On top-level call, validate forwardTo cycles for the entire batch
    if (parentPrefix === "") {
      this.#validateBatchForwardToCycles(routes, "");
    }
  }

  /**
   * Validates that adding a batch of routes doesn't create forwardTo cycles.
   * Builds a test map combining existing forwardMap + batch forwardTo and checks for cycles.
   */
  #validateBatchForwardToCycles(
    routes: Route<Dependencies>[],
    parentPrefix: string,
  ): void {
    const config = this.#routes.getConfig();
    const testMap: Record<string, string> = { ...config.forwardMap };

    // Collect all forwardTo from the batch
    this.#collectBatchForwardTo(routes, parentPrefix, testMap);

    // Verify no cycles with combined map
    const maxDepth = 100;

    for (const fromRoute of Object.keys(testMap)) {
      const visited = new Set<string>();
      const chain: string[] = [fromRoute];
      let current = fromRoute;

      while (testMap[current]) {
        const next = testMap[current];

        if (visited.has(next)) {
          const cycleStart = chain.indexOf(next);
          const cycle = [...chain.slice(cycleStart), next];

          throw new Error(`Circular forwardTo: ${cycle.join(" → ")}`);
        }

        visited.add(current);
        chain.push(next);
        current = next;

        if (chain.length > maxDepth) {
          throw new Error(
            `forwardTo chain exceeds maximum depth (${maxDepth}): ${chain.join(" → ")}`,
          );
        }
      }
    }
  }

  /**
   * Recursively collects all forwardTo mappings from a batch of routes.
   */
  #collectBatchForwardTo(
    routes: Route<Dependencies>[],
    parentPrefix: string,
    targetMap: Record<string, string>,
  ): void {
    for (const route of routes) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime check
      if (!route || typeof route !== "object") {
        continue;
      }

      const fullName = parentPrefix
        ? `${parentPrefix}.${route.name}`
        : route.name;

      if (route.forwardTo) {
        targetMap[fullName] = route.forwardTo;
      }

      if (route.children && Array.isArray(route.children)) {
        this.#collectBatchForwardTo(route.children, fullName, targetMap);
      }
    }
  }

  /**
   * Validates that forwardTo target doesn't require params that source doesn't have.
   */
  #validateForwardToParamCompatibility(
    sourceName: string,
    targetName: string,
  ): void {
    const sourceSegments = getSegmentsByName(
      this.#routes.getTree(),
      sourceName,
    );
    const targetSegments = getSegmentsByName(
      this.#routes.getTree(),
      targetName,
    );

    if (!sourceSegments || !targetSegments) {
      return;
    }

    // Get source URL params
    const sourceParams = new Set<string>();

    for (const segment of sourceSegments) {
      if (segment.parser) {
        for (const param of segment.parser.urlParams) {
          sourceParams.add(param);
        }
      }
    }

    // Get target URL params
    const targetParams: string[] = [];

    for (const segment of targetSegments) {
      if (segment.parser) {
        for (const param of segment.parser.urlParams) {
          targetParams.push(param);
        }
      }
    }

    // Check if target requires params that source doesn't have
    const missingParams = targetParams.filter(
      (param) => !sourceParams.has(param),
    );

    if (missingParams.length > 0) {
      throw new Error(
        `[real-router] updateRoute: forwardTo target "${targetName}" requires params ` +
          `[${missingParams.join(", ")}] that are not available in source route "${sourceName}"`,
      );
    }
  }

  /**
   * Validates that adding forwardTo doesn't create a cycle.
   * Creates a test map with the new entry and uses resolveForwardChain
   * to detect cycles before any mutation happens.
   */
  #validateForwardToCycle(sourceName: string, targetName: string): void {
    const config = this.#routes.getConfig();

    // Create a test map with the new entry to validate BEFORE mutation
    const testMap = {
      ...config.forwardMap,
      [sourceName]: targetName,
    };

    // resolveForwardChain will throw if cycle is detected or max depth exceeded
    resolveForwardChain(sourceName, testMap);
  }
}
