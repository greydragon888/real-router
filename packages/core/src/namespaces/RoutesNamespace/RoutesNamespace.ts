// packages/core/src/namespaces/RoutesNamespace/RoutesNamespace.ts

import { logger } from "@real-router/logger";
import {
  createMatcher,
  createRouteTree,
  nodeToDefinition,
  routeTreeToDefinitions,
} from "route-tree";
import { isString, validateRouteName } from "type-guards";

import { DEFAULT_ROUTE_NAME, validatedRouteNames } from "./constants";
import {
  clearConfigEntries,
  createEmptyConfig,
  paramsMatch,
  paramsMatchExcluding,
  removeFromDefinitions,
  resolveForwardChain,
  sanitizeRoute,
} from "./helpers";
import { createRouteState } from "./stateBuilder";
import {
  validateRemoveRouteArgs,
  validateSetRootPathArgs,
  validateAddRouteArgs,
  validateIsActiveRouteArgs,
  validateStateBuilderArgs,
  validateUpdateRouteBasicArgs,
  validateUpdateRoutePropertyTypes,
  validateBuildPathArgs,
  validateMatchPathArgs,
  validateShouldUpdateNodeArgs,
  validateRoutes,
} from "./validators";
import { constants } from "../../constants";
import { getTransitionPath } from "../../transitionPath";

import type { RouteConfig, RoutesDependencies } from "./types";
import type {
  ActivationFnFactory,
  BuildStateResultWithSegments,
  Route,
  RouteConfigUpdate,
} from "../../types";
import type { RouteLifecycleNamespace } from "../RouteLifecycleNamespace";
import type {
  DefaultDependencies,
  ForwardToCallback,
  Options,
  Params,
  State,
} from "@real-router/types";
import type {
  CreateMatcherOptions,
  Matcher,
  RouteDefinition,
  RouteTree,
  RouteTreeState,
} from "route-tree";

const EMPTY_OPTIONS = Object.freeze({});

/**
 * Independent namespace for managing routes.
 *
 * Static methods handle validation (called by facade).
 * Instance methods handle storage and business logic.
 */
export class RoutesNamespace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  // =========================================================================
  // Private instance fields
  // =========================================================================

  readonly #definitions: RouteDefinition[] = [];
  readonly #config: RouteConfig = createEmptyConfig();
  readonly #resolvedForwardMap: Record<string, string> = Object.create(
    null,
  ) as Record<string, string>;

  // Pending canActivate handlers that need to be registered after router is set
  // Key: route name, Value: canActivate factory
  readonly #pendingCanActivate = new Map<
    string,
    ActivationFnFactory<Dependencies>
  >();

  // Pending canDeactivate handlers that need to be registered after router is set
  // Key: route name, Value: canDeactivate factory
  readonly #pendingCanDeactivate = new Map<
    string,
    ActivationFnFactory<Dependencies>
  >();

  #rootPath = "";
  #tree: RouteTree;
  #matcher: Matcher;
  readonly #matcherOptions: CreateMatcherOptions | undefined;

  // Dependencies injected via setDependencies (for facade method calls)
  #depsStore: RoutesDependencies<Dependencies> | undefined;

  // Lifecycle handlers reference (set after construction)
  #lifecycleNamespace: RouteLifecycleNamespace<Dependencies> | undefined;

  // When true, skips validation for production performance
  readonly #noValidate: boolean;

  /**
   * Gets dependencies or throws if not initialized.
   */
  get #deps(): RoutesDependencies<Dependencies> {
    /* v8 ignore next 3 -- @preserve: deps always set by Router.ts */
    if (!this.#depsStore) {
      throw new Error(
        "[real-router] RoutesNamespace: dependencies not initialized",
      );
    }

    return this.#depsStore;
  }

  // =========================================================================
  // Constructor
  // =========================================================================

  constructor(
    routes: Route<Dependencies>[] = [],
    noValidate = false,
    matcherOptions?: CreateMatcherOptions,
  ) {
    this.#noValidate = noValidate;
    this.#matcherOptions = matcherOptions;

    // Sanitize routes to store only essential properties
    for (const route of routes) {
      this.#definitions.push(sanitizeRoute(route));
    }

    // Create initial tree
    this.#tree = createRouteTree(
      DEFAULT_ROUTE_NAME,
      this.#rootPath,
      this.#definitions,
    );

    // Initialize matcher with options and register tree
    this.#matcher = createMatcher(matcherOptions);
    this.#matcher.registerTree(this.#tree);

    // Register handlers for all routes (defaultParams, encoders, decoders, forwardTo)
    // Note: canActivate handlers are registered later when #lifecycleNamespace is set
    this.#registerAllRouteHandlers(routes);

    // Validate and cache forwardTo chains (detect cycles)
    // Skip validation in noValidate mode for production performance
    if (noValidate) {
      // Still need to cache resolved forwards, just skip validation
      this.#cacheForwardMap();
    } else {
      this.#validateAndCacheForwardMap();
    }
  }

  // =========================================================================
  // Static validation methods (delegated to validators.ts)
  // TypeScript requires explicit method declarations for assertion functions
  // =========================================================================

  static validateRemoveRouteArgs(name: unknown): asserts name is string {
    validateRemoveRouteArgs(name);
  }

  static validateSetRootPathArgs(
    rootPath: unknown,
  ): asserts rootPath is string {
    validateSetRootPathArgs(rootPath);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any Route type
  static validateAddRouteArgs(routes: readonly Route<any>[]): void {
    validateAddRouteArgs(routes);
  }

  static validateIsActiveRouteArgs(
    name: unknown,
    params: unknown,
    strictEquality: unknown,
    ignoreQueryParams: unknown,
  ): void {
    validateIsActiveRouteArgs(name, params, strictEquality, ignoreQueryParams);
  }

  static validateStateBuilderArgs(
    routeName: unknown,
    routeParams: unknown,
    methodName: string,
  ): void {
    validateStateBuilderArgs(routeName, routeParams, methodName);
  }

  static validateUpdateRouteBasicArgs<Deps extends DefaultDependencies>(
    name: unknown,
    updates: unknown,
  ): asserts updates is RouteConfigUpdate<Deps> {
    validateUpdateRouteBasicArgs<Deps>(name, updates);
  }

  static validateUpdateRoutePropertyTypes(
    forwardTo: unknown,
    defaultParams: unknown,
    decodeParams: unknown,
    encodeParams: unknown,
  ): void {
    validateUpdateRoutePropertyTypes(
      forwardTo,
      defaultParams,
      decodeParams,
      encodeParams,
    );
  }

  static validateBuildPathArgs(route: unknown): asserts route is string {
    validateBuildPathArgs(route);
  }

  static validateMatchPathArgs(path: unknown): asserts path is string {
    validateMatchPathArgs(path);
  }

  static validateShouldUpdateNodeArgs(
    nodeName: unknown,
  ): asserts nodeName is string {
    validateShouldUpdateNodeArgs(nodeName);
  }

  static validateRoutes<Deps extends DefaultDependencies>(
    routes: Route<Deps>[],
    tree?: RouteTree,
    forwardMap?: Record<string, string>,
  ): void {
    validateRoutes(routes, tree, forwardMap);
  }

  // =========================================================================
  // Dependency injection
  // =========================================================================

  /**
   * Sets dependencies and registers pending canActivate handlers.
   * canActivate handlers from initial routes are deferred until deps are set.
   */
  setDependencies(deps: RoutesDependencies<Dependencies>): void {
    this.#depsStore = deps;

    // Register pending canActivate handlers that were deferred during construction
    for (const [routeName, handler] of this.#pendingCanActivate) {
      deps.addActivateGuard(routeName, handler);
    }

    // Clear pending handlers after registration
    this.#pendingCanActivate.clear();

    // Register pending canDeactivate handlers that were deferred during construction
    for (const [routeName, handler] of this.#pendingCanDeactivate) {
      deps.addDeactivateGuard(routeName, handler);
    }

    // Clear pending handlers after registration
    this.#pendingCanDeactivate.clear();
  }

  /**
   * Sets the lifecycle namespace reference.
   */
  setLifecycleNamespace(
    namespace: RouteLifecycleNamespace<Dependencies> | undefined,
  ): void {
    this.#lifecycleNamespace = namespace;
  }

  // =========================================================================
  // Route tree operations
  // =========================================================================

  /**
   * Returns the root path.
   */
  getRootPath(): string {
    return this.#rootPath;
  }

  /**
   * Returns the route tree.
   * Used by facade for state-dependent validation.
   */
  getTree(): RouteTree {
    return this.#tree;
  }

  /**
   * Returns the forward record (route name -> forward target).
   * Used by facade for state-dependent validation.
   */
  getForwardRecord(): Record<string, string> {
    return this.#config.forwardMap;
  }

  /**
   * Sets the root path and rebuilds the tree.
   */
  setRootPath(newRootPath: string): void {
    this.#rootPath = newRootPath;
    this.#rebuildTree();
  }

  /**
   * Checks if a route exists.
   */
  hasRoute(name: string): boolean {
    return this.#matcher.hasRoute(name);
  }

  /**
   * Gets a route by name with all its configuration.
   */
  getRoute(name: string): Route<Dependencies> | undefined {
    const segments = this.#matcher.getSegmentsByName(name);

    if (!segments) {
      return undefined;
    }

    const targetNode = this.#getLastSegment(segments as readonly RouteTree[]);
    const definition = nodeToDefinition(targetNode);

    return this.#enrichRoute(definition, name);
  }

  /**
   * Adds one or more routes to the router.
   * Input already validated by facade (properties and state-dependent checks).
   *
   * @param routes - Routes to add
   */
  addRoutes(routes: Route<Dependencies>[]): void {
    // Add to definitions
    for (const route of routes) {
      this.#definitions.push(sanitizeRoute(route));
    }

    // Register handlers
    this.#registerAllRouteHandlers(routes);

    // Rebuild tree
    this.#rebuildTree();

    // Validate and cache forwardTo chains
    this.#refreshForwardMap();
  }

  /**
   * Removes a route and all its children.
   *
   * @param name - Route name (already validated)
   * @returns true if removed, false if not found
   */
  removeRoute(name: string): boolean {
    const wasRemoved = removeFromDefinitions(this.#definitions, name);

    if (!wasRemoved) {
      return false;
    }

    // Clear configurations for removed route
    this.#clearRouteConfigurations(name);

    // Rebuild tree
    this.#rebuildTree();

    // Revalidate forward chains
    this.#refreshForwardMap();

    return true;
  }

  /**
   * Updates a route's configuration in place without rebuilding the tree.
   * This is used by Router.updateRoute to directly modify config entries
   * without destroying other routes' forwardMap references.
   *
   * @param name - Route name
   * @param updates - Config updates to apply
   * @param updates.forwardTo - Forward target route name (null to clear)
   * @param updates.defaultParams - Default parameters (null to clear)
   * @param updates.decodeParams - Params decoder function (null to clear)
   * @param updates.encodeParams - Params encoder function (null to clear)
   */

  updateRouteConfig(
    name: string,
    updates: {
      forwardTo?: string | ForwardToCallback<Dependencies> | null | undefined;
      defaultParams?: Params | null | undefined;
      decodeParams?: ((params: Params) => Params) | null | undefined;
      encodeParams?: ((params: Params) => Params) | null | undefined;
    },
  ): void {
    // Update forwardTo
    if (updates.forwardTo !== undefined) {
      if (updates.forwardTo === null) {
        delete this.#config.forwardMap[name];
        delete this.#config.forwardFnMap[name];
      } else if (typeof updates.forwardTo === "string") {
        delete this.#config.forwardFnMap[name];
        this.#config.forwardMap[name] = updates.forwardTo;
      } else {
        delete this.#config.forwardMap[name];
        this.#config.forwardFnMap[name] = updates.forwardTo;
      }

      this.#refreshForwardMap();
    }

    // Update defaultParams
    if (updates.defaultParams !== undefined) {
      if (updates.defaultParams === null) {
        delete this.#config.defaultParams[name];
      } else {
        this.#config.defaultParams[name] = updates.defaultParams;
      }
    }

    // Update decoders with fallback wrapper
    // Runtime guard: fallback to params if decoder returns undefined (bad user code)
    if (updates.decodeParams !== undefined) {
      if (updates.decodeParams === null) {
        delete this.#config.decoders[name];
      } else {
        const decoder = updates.decodeParams;

        this.#config.decoders[name] = (params: Params): Params =>
          (decoder(params) as Params | undefined) ?? params;
      }
    }

    // Update encoders with fallback wrapper
    // Runtime guard: fallback to params if encoder returns undefined (bad user code)
    if (updates.encodeParams !== undefined) {
      if (updates.encodeParams === null) {
        delete this.#config.encoders[name];
      } else {
        const encoder = updates.encodeParams;

        this.#config.encoders[name] = (params: Params): Params =>
          (encoder(params) as Params | undefined) ?? params;
      }
    }
  }

  /**
   * Clears all routes from the router.
   */
  clearRoutes(): void {
    this.#definitions.length = 0;

    // Clear all config entries
    for (const key in this.#config.decoders) {
      delete this.#config.decoders[key];
    }

    for (const key in this.#config.encoders) {
      delete this.#config.encoders[key];
    }

    for (const key in this.#config.defaultParams) {
      delete this.#config.defaultParams[key];
    }

    for (const key in this.#config.forwardMap) {
      delete this.#config.forwardMap[key];
    }

    for (const key in this.#config.forwardFnMap) {
      delete this.#config.forwardFnMap[key];
    }

    // Clear forward cache
    for (const key in this.#resolvedForwardMap) {
      delete this.#resolvedForwardMap[key];
    }

    // Rebuild empty tree
    this.#rebuildTree();
  }

  // =========================================================================
  // Path operations
  // =========================================================================

  /**
   * Builds a URL path for a route.
   * Note: Argument validation is done by facade (Router.ts) via validateBuildPathArgs.
   *
   * @param route - Route name
   * @param params - Route parameters
   * @param options - Router options
   */
  buildPath(route: string, params?: Params, options?: Options): string {
    if (route === constants.UNKNOWN_ROUTE) {
      return isString(params?.path) ? params.path : "";
    }

    // R2 optimization: avoid spread when no defaultParams
    const paramsWithDefault = Object.hasOwn(this.#config.defaultParams, route)
      ? { ...this.#config.defaultParams[route], ...params }
      : (params ?? {});

    // Apply custom encoder if defined
    const encodedParams =
      typeof this.#config.encoders[route] === "function"
        ? this.#config.encoders[route]({ ...paramsWithDefault })
        : paramsWithDefault;

    // Map core trailingSlash to matcher: "preserve"/"strict" → default (no change)
    const ts = options?.trailingSlash;
    const trailingSlash = ts === "never" || ts === "always" ? ts : undefined;

    return this.#matcher.buildPath(route, encodedParams, {
      trailingSlash,
      queryParamsMode: options?.queryParamsMode,
    });
  }

  /**
   * Matches a URL path to a route in the tree.
   * Note: Argument validation is done by facade (Router.ts) via validateMatchPathArgs.
   */
  matchPath<P extends Params = Params, MP extends Params = Params>(
    path: string,
    source?: string,
    options?: Options,
  ): State<P, MP> | undefined {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Router.ts always passes options
    const opts = options!;

    const matchResult = this.#matcher.match(path);

    if (!matchResult) {
      return undefined;
    }

    const routeState = createRouteState(matchResult);
    const { name, params, meta } = routeState;

    const decodedParams =
      typeof this.#config.decoders[name] === "function"
        ? this.#config.decoders[name](params as Params)
        : params;

    const { name: routeName, params: routeParams } = this.forwardState<P>(
      name,
      decodedParams as P,
    );

    let builtPath = path;

    if (opts.rewritePathOnMatch) {
      const buildParams =
        typeof this.#config.encoders[routeName] === "function"
          ? this.#config.encoders[routeName]({
              ...(routeParams as Params),
            })
          : (routeParams as Record<string, unknown>);

      const ts = opts.trailingSlash;

      builtPath = this.#matcher.buildPath(routeName, buildParams, {
        trailingSlash: ts === "never" || ts === "always" ? ts : undefined,
        queryParamsMode: opts.queryParamsMode,
      });
    }

    return this.#deps.makeState<P, MP>(routeName, routeParams, builtPath, {
      params: meta as MP,
      options: EMPTY_OPTIONS,
      source,
      redirected: false,
    });
  }

  /**
   * Applies forwardTo and returns resolved state with merged defaultParams.
   *
   * Merges params in order:
   * 1. Source route defaultParams
   * 2. Provided params
   * 3. Target route defaultParams (after resolving forwardTo)
   */
  forwardState<P extends Params = Params>(
    name: string,
    params: P,
  ): { name: string; params: P } {
    // Path 1: Dynamic forward
    if (Object.hasOwn(this.#config.forwardFnMap, name)) {
      const paramsWithSourceDefaults = this.#mergeDefaultParams(name, params);
      const dynamicForward = this.#config.forwardFnMap[name];
      const resolved = this.#resolveDynamicForward(
        name,
        dynamicForward,
        params,
      );

      return {
        name: resolved,
        params: this.#mergeDefaultParams(resolved, paramsWithSourceDefaults),
      };
    }

    // Path 2: Static forward (O(1) cached)
    const staticForward = this.#resolvedForwardMap[name] ?? name;

    // Path 3: Mixed chain (static target has dynamic forward)
    if (
      staticForward !== name &&
      Object.hasOwn(this.#config.forwardFnMap, staticForward)
    ) {
      const paramsWithSourceDefaults = this.#mergeDefaultParams(name, params);
      const targetDynamicForward = this.#config.forwardFnMap[staticForward];
      const resolved = this.#resolveDynamicForward(
        staticForward,
        targetDynamicForward,
        params,
      );

      return {
        name: resolved,
        params: this.#mergeDefaultParams(resolved, paramsWithSourceDefaults),
      };
    }

    // Path 4: Static forward only
    if (staticForward !== name) {
      const paramsWithSourceDefaults = this.#mergeDefaultParams(name, params);

      return {
        name: staticForward,
        params: this.#mergeDefaultParams(
          staticForward,
          paramsWithSourceDefaults,
        ),
      };
    }

    // No forward - merge own defaults
    return { name, params: this.#mergeDefaultParams(name, params) };
  }

  /**
   * Builds a RouteTreeState from already-resolved route name and params.
   * Called by Router.buildState after forwardState is applied at facade level.
   * This allows plugins to intercept forwardState.
   */
  buildStateResolved(
    resolvedName: string,
    resolvedParams: Params,
  ): RouteTreeState | undefined {
    const segments = this.#matcher.getSegmentsByName(resolvedName);

    if (!segments) {
      return undefined;
    }

    /* v8 ignore next -- @preserve: meta always exists when segments exist */
    const meta = this.#matcher.getMetaByName(resolvedName) ?? {};

    return createRouteState(
      { segments, params: resolvedParams, meta },
      resolvedName,
    );
  }

  /**
   * Builds a RouteTreeState with segments from already-resolved route name and params.
   * Called by Router.buildStateWithSegments after forwardState is applied at facade level.
   * This allows plugins to intercept forwardState.
   */
  buildStateWithSegmentsResolved<P extends Params = Params>(
    resolvedName: string,
    resolvedParams: P,
  ): BuildStateResultWithSegments<P> | undefined {
    const segments = this.#matcher.getSegmentsByName(resolvedName);

    if (!segments) {
      return undefined;
    }

    /* v8 ignore next -- @preserve: meta always exists when segments exist */
    const meta = this.#matcher.getMetaByName(resolvedName) ?? {};
    const state = createRouteState<P>(
      {
        segments: segments as readonly RouteTree[],
        params: resolvedParams,
        meta,
      },
      resolvedName,
    );

    return { state, segments: segments as readonly RouteTree[] };
  }

  // =========================================================================
  // Query operations
  // =========================================================================

  /**
   * Checks if a route is currently active.
   */
  isActiveRoute(
    name: string,
    params: Params = {},
    strictEquality = false,
    ignoreQueryParams = true,
  ): boolean {
    // Fast path: skip regex validation for already-validated route names
    if (!validatedRouteNames.has(name)) {
      validateRouteName(name, "isActiveRoute");
      validatedRouteNames.add(name);
    }

    // Note: empty string check is handled by Router.ts facade
    const activeState = this.#deps.getState();

    if (!activeState) {
      return false;
    }

    const activeName = activeState.name;

    // Fast path: check if routes are related before expensive operations
    if (
      activeName !== name &&
      !activeName.startsWith(`${name}.`) &&
      !name.startsWith(`${activeName}.`)
    ) {
      return false;
    }

    const defaultParams = this.#config.defaultParams[name] as
      | Params
      | undefined;

    // Exact match case
    if (strictEquality || activeName === name) {
      const effectiveParams = defaultParams
        ? { ...defaultParams, ...params }
        : params;

      const targetState: State = {
        name,
        params: effectiveParams,
        path: "",
      };

      return this.#deps.areStatesEqual(
        targetState,
        activeState,
        ignoreQueryParams,
      );
    }

    // Hierarchical check: activeState is a descendant of target (name)
    const activeParams = activeState.params;

    if (!paramsMatch(params, activeParams)) {
      return false;
    }

    // Check defaultParams (skip keys already in params)
    return (
      !defaultParams ||
      paramsMatchExcluding(defaultParams, activeParams, params)
    );
  }

  /**
   * Creates a predicate function to check if a route node should be updated.
   * Note: Argument validation is done by facade (Router.ts) via validateShouldUpdateNodeArgs.
   */
  shouldUpdateNode(
    nodeName: string,
  ): (toState: State, fromState?: State) => boolean {
    return (toState: State, fromState?: State): boolean => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!(toState && typeof toState === "object" && "name" in toState)) {
        throw new TypeError(
          "[router.shouldUpdateNode] toState must be valid State object",
        );
      }

      if (toState.meta?.options.reload) {
        return true;
      }

      if (nodeName === DEFAULT_ROUTE_NAME && !fromState) {
        return true;
      }

      const { intersection, toActivate, toDeactivate } = getTransitionPath(
        toState,
        fromState,
      );

      if (nodeName === intersection) {
        return true;
      }

      if (toActivate.includes(nodeName)) {
        return true;
      }

      return toDeactivate.includes(nodeName);
    };
  }

  /**
   * Returns the config object.
   */
  getConfig(): RouteConfig {
    return this.#config;
  }

  /**
   * Returns URL params for a route.
   * Used by StateNamespace.
   */
  getUrlParams(name: string): string[] {
    const segments = this.#matcher.getSegmentsByName(name);

    if (!segments) {
      return [];
    }

    return this.#collectUrlParamsArray(segments as readonly RouteTree[]);
  }

  /**
   * Returns the resolved forward map.
   */
  getResolvedForwardMap(): Record<string, string> {
    return this.#resolvedForwardMap;
  }

  /**
   * Sets resolved forward map (used by clone).
   */
  setResolvedForwardMap(map: Record<string, string>): void {
    Object.assign(this.#resolvedForwardMap, map);
  }

  /**
   * Creates a clone of the routes for a new router (from tree).
   */
  cloneRoutes(): Route<Dependencies>[] {
    return routeTreeToDefinitions(this.#tree) as Route<Dependencies>[];
  }

  // =========================================================================
  // Public validation methods (used by Router facade)
  // =========================================================================

  /**
   * Validates that forwardTo target doesn't require params that source doesn't have.
   * Used by updateRoute for forwardTo validation.
   */
  validateForwardToParamCompatibility(
    sourceName: string,
    targetName: string,
  ): void {
    const context = "validateForwardToParamCompatibility";
    const sourceSegments = this.#getSegmentsOrThrow(sourceName, context);
    const targetSegments = this.#getSegmentsOrThrow(targetName, context);

    // Get source and target URL params using helper
    const sourceParams = this.#collectUrlParams(sourceSegments);
    const targetParams = this.#collectUrlParamsArray(targetSegments);

    // Check if target requires params that source doesn't have
    const missingParams = targetParams.filter(
      (param) => !sourceParams.has(param),
    );

    if (missingParams.length > 0) {
      throw new Error(
        `[real-router] forwardTo target "${targetName}" requires params ` +
          `[${missingParams.join(", ")}] that are not available in source route "${sourceName}"`,
      );
    }
  }

  /**
   * Validates that adding forwardTo doesn't create a cycle.
   * Creates a test map with the new entry and uses resolveForwardChain
   * to detect cycles before any mutation happens.
   * Used by updateRoute for forwardTo validation.
   */
  validateForwardToCycle(sourceName: string, targetName: string): void {
    // Create a test map with the new entry to validate BEFORE mutation
    const testMap = {
      ...this.#config.forwardMap,
      [sourceName]: targetName,
    };

    // resolveForwardChain will throw if cycle is detected or max depth exceeded
    resolveForwardChain(sourceName, testMap);
  }

  /**
   * Validates removeRoute constraints.
   * Returns false if removal should be blocked (route is active).
   * Logs warnings for edge cases.
   *
   * @param name - Route name to remove
   * @param currentStateName - Current active route name (or undefined)
   * @param isNavigating - Whether navigation is in progress
   * @returns true if removal can proceed, false if blocked
   */
  validateRemoveRoute(
    name: string,
    currentStateName: string | undefined,
    isNavigating: boolean,
  ): boolean {
    // Check if trying to remove currently active route (or its parent)
    if (currentStateName) {
      const isExactMatch = currentStateName === name;
      const isParentOfCurrent = currentStateName.startsWith(`${name}.`);

      if (isExactMatch || isParentOfCurrent) {
        const suffix = isExactMatch ? "" : ` (current: "${currentStateName}")`;

        logger.warn(
          "router.removeRoute",
          `Cannot remove route "${name}" — it is currently active${suffix}. Navigate away first.`,
        );

        return false;
      }
    }

    // Warn if navigation is in progress (but allow removal)
    if (isNavigating) {
      logger.warn(
        "router.removeRoute",
        `Route "${name}" removed while navigation is in progress. This may cause unexpected behavior.`,
      );
    }

    return true;
  }

  /**
   * Validates clearRoutes operation.
   * Returns false if operation should be blocked (navigation in progress).
   *
   * @param isNavigating - Whether navigation is in progress
   * @returns true if clearRoutes can proceed, false if blocked
   */
  validateClearRoutes(isNavigating: boolean): boolean {
    if (isNavigating) {
      logger.error(
        "router.clearRoutes",
        "Cannot clear routes while navigation is in progress. Wait for navigation to complete.",
      );

      return false;
    }

    return true;
  }

  /**
   * Validates updateRoute instance-level constraints (route existence, forwardTo).
   * Called after static validation passes.
   *
   * @param name - Route name (already validated by static method)
   * @param forwardTo - Cached forwardTo value (to avoid calling getter twice)
   */
  validateUpdateRoute(
    name: string,
    forwardTo: string | ForwardToCallback<Dependencies> | null | undefined,
  ): void {
    // Validate route exists
    if (!this.hasRoute(name)) {
      throw new ReferenceError(
        `[real-router] updateRoute: route "${name}" does not exist`,
      );
    }

    // Validate forwardTo target exists and is valid (only for string forwardTo)
    if (
      forwardTo !== undefined &&
      forwardTo !== null &&
      typeof forwardTo === "string"
    ) {
      if (!this.hasRoute(forwardTo)) {
        throw new Error(
          `[real-router] updateRoute: forwardTo target "${forwardTo}" does not exist`,
        );
      }

      // Check forwardTo param compatibility
      this.validateForwardToParamCompatibility(name, forwardTo);

      // Check for cycle detection
      this.validateForwardToCycle(name, forwardTo);
    }
  }

  // =========================================================================
  // Private methods
  // =========================================================================

  /**
   * Merges route's defaultParams with provided params.
   */
  #mergeDefaultParams<P extends Params = Params>(
    routeName: string,
    params: P,
  ): P {
    if (Object.hasOwn(this.#config.defaultParams, routeName)) {
      return { ...this.#config.defaultParams[routeName], ...params } as P;
    }

    return params;
  }

  /**
   * Resolves dynamic forwardTo chain with cycle detection and max depth.
   * Throws if cycle detected, max depth exceeded, or invalid return type.
   */
  #resolveDynamicForward(
    startName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    startFn: ForwardToCallback<any>,
    params: Params,
  ): string {
    const visited = new Set<string>([startName]);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    let current = startFn(this.#deps.getDependency as any, params);
    let depth = 0;
    const MAX_DEPTH = 100;

    // Validate initial return type
    if (typeof current !== "string") {
      throw new TypeError(
        `forwardTo callback must return a string, got ${typeof current}`,
      );
    }

    while (depth < MAX_DEPTH) {
      // Check if target route exists

      if (this.#matcher.getSegmentsByName(current) === undefined) {
        throw new Error(`Route "${current}" does not exist`);
      }

      // Check for cycle
      if (visited.has(current)) {
        const chain = [...visited, current].join(" → ");

        throw new Error(`Circular forwardTo detected: ${chain}`);
      }

      visited.add(current);

      // Check if current has dynamic forward
      if (Object.hasOwn(this.#config.forwardFnMap, current)) {
        const fn = this.#config.forwardFnMap[current];

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
        current = fn(this.#deps.getDependency as any, params);

        /* v8 ignore next 4 -- @preserve: defensive check, validated at registration */
        if (typeof current !== "string") {
          throw new TypeError(
            `forwardTo callback must return a string, got ${typeof current}`,
          );
        }

        depth++;
        continue;
      }

      // Check if current has static forward
      const staticForward = this.#config.forwardMap[current];

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (staticForward !== undefined) {
        current = staticForward;
        depth++;
        continue;
      }

      // No more forwards - return current
      return current;
    }

    throw new Error(`forwardTo exceeds maximum depth of ${MAX_DEPTH}`);
  }

  #rebuildTree(): void {
    this.#tree = createRouteTree(
      DEFAULT_ROUTE_NAME,
      this.#rootPath,
      this.#definitions,
    );

    // Re-register tree in matcher (creates new instance, preserving options if set)
    this.#matcher = createMatcher(this.#matcherOptions);
    this.#matcher.registerTree(this.#tree);
  }

  /**
   * Gets segments by name or throws if not found.
   * Use when route existence has been validated by hasRoute() beforehand.
   */
  #getSegmentsOrThrow(name: string, context: string): readonly RouteTree[] {
    const segments = this.#matcher.getSegmentsByName(name);

    /* v8 ignore next 4 -- @preserve: defensive check, hasRoute() validates before call */
    if (!segments) {
      throw new ReferenceError(
        `[real-router] ${context}: route "${name}" does not exist`,
      );
    }

    return segments as readonly RouteTree[];
  }

  /**
   * Gets last segment from segments array.
   * Use when segments array is guaranteed to be non-empty.
   */
  #getLastSegment(segments: readonly RouteTree[]): RouteTree {
    const last = segments.at(-1);

    /* v8 ignore next 3 -- @preserve: defensive check, segments always non-empty when called */
    if (!last) {
      throw new Error("[real-router] Internal error: empty segments array");
    }

    return last;
  }

  /**
   * Collects URL params from segments into a Set.
   */
  #collectUrlParams(segments: readonly RouteTree[]): Set<string> {
    const params = new Set<string>();

    for (const segment of segments) {
      // Named routes always have parsers (null only for root without path)
      for (const param of segment.paramMeta.urlParams) {
        params.add(param);
      }
    }

    return params;
  }

  /**
   * Collects URL params from segments into an array.
   *
   * @param segments - Non-null segments (caller must validate existence first)
   */
  #collectUrlParamsArray(segments: readonly RouteTree[]): string[] {
    const params: string[] = [];

    for (const segment of segments) {
      // Named routes always have parsers (null only for root without path)
      for (const param of segment.paramMeta.urlParams) {
        params.push(param);
      }
    }

    return params;
  }

  /**
   * Refreshes forward map cache, conditionally validating based on noValidate flag.
   */
  #refreshForwardMap(): void {
    if (this.#noValidate) {
      this.#cacheForwardMap();
    } else {
      this.#validateAndCacheForwardMap();
    }
  }

  #validateAndCacheForwardMap(): void {
    // Clear existing cache
    for (const key in this.#resolvedForwardMap) {
      delete this.#resolvedForwardMap[key];
    }

    // Resolve all chains
    for (const fromRoute of Object.keys(this.#config.forwardMap)) {
      this.#resolvedForwardMap[fromRoute] = resolveForwardChain(
        fromRoute,
        this.#config.forwardMap,
      );
    }
  }

  /**
   * Caches forward chains without validation (noValidate mode).
   * Simply resolves chains without cycle detection or max depth checks.
   */
  #cacheForwardMap(): void {
    // Clear existing cache
    for (const key in this.#resolvedForwardMap) {
      delete this.#resolvedForwardMap[key];
    }

    // Resolve chains without validation
    for (const fromRoute of Object.keys(this.#config.forwardMap)) {
      let current = fromRoute;

      while (this.#config.forwardMap[current]) {
        current = this.#config.forwardMap[current];
      }

      this.#resolvedForwardMap[fromRoute] = current;
    }
  }

  #clearRouteConfigurations(routeName: string): void {
    const shouldClear = (n: string): boolean =>
      n === routeName || n.startsWith(`${routeName}.`);

    clearConfigEntries(this.#config.decoders, shouldClear);
    clearConfigEntries(this.#config.encoders, shouldClear);
    clearConfigEntries(this.#config.defaultParams, shouldClear);
    clearConfigEntries(this.#config.forwardMap, shouldClear);
    clearConfigEntries(this.#config.forwardFnMap, shouldClear);

    // Clear forwardMap entries pointing TO deleted route
    clearConfigEntries(this.#config.forwardMap, (key) =>
      shouldClear(this.#config.forwardMap[key]),
    );

    // Clear lifecycle handlers if namespace is set
    /* v8 ignore next -- @preserve unreachable: Router always sets lifecycleNamespace */
    if (this.#lifecycleNamespace) {
      const [canDeactivateFactories, canActivateFactories] =
        this.#lifecycleNamespace.getFactories();

      for (const n of Object.keys(canActivateFactories)) {
        if (shouldClear(n)) {
          this.#lifecycleNamespace.clearCanActivate(n);
        }
      }

      for (const n of Object.keys(canDeactivateFactories)) {
        if (shouldClear(n)) {
          this.#lifecycleNamespace.clearCanDeactivate(n);
        }
      }
    }
  }

  #registerAllRouteHandlers(
    routes: readonly Route<Dependencies>[],
    parentName = "",
  ): void {
    for (const route of routes) {
      const fullName = parentName ? `${parentName}.${route.name}` : route.name;

      this.#registerSingleRouteHandlers(route, fullName);

      if (route.children) {
        this.#registerAllRouteHandlers(route.children, fullName);
      }
    }
  }

  #registerSingleRouteHandlers(
    route: Route<Dependencies>,
    fullName: string,
  ): void {
    // Register canActivate via deps.canActivate (allows tests to spy on router.canActivate)
    if (route.canActivate) {
      // Note: Uses #depsStore directly because this method is called from constructor
      // before setDependencies(). The getter #deps would throw if deps not set.
      if (this.#depsStore) {
        // Deps available, register immediately
        this.#depsStore.addActivateGuard(fullName, route.canActivate);
      } else {
        // Deps not set yet, store for later registration
        this.#pendingCanActivate.set(fullName, route.canActivate);
      }
    }

    // Register canDeactivate via deps.canDeactivate (allows tests to spy on router.canDeactivate)
    if (route.canDeactivate) {
      // Note: Uses #depsStore directly because this method is called from constructor
      // before setDependencies(). The getter #deps would throw if deps not set.
      if (this.#depsStore) {
        // Deps available, register immediately
        this.#depsStore.addDeactivateGuard(fullName, route.canDeactivate);
      } else {
        // Deps not set yet, store for later registration
        this.#pendingCanDeactivate.set(fullName, route.canDeactivate);
      }
    }

    // Register forwardTo
    if (route.forwardTo) {
      this.#registerForwardTo(route, fullName);
    }

    // Register transformers with fallback wrapper
    if (route.decodeParams) {
      this.#config.decoders[fullName] = (params: Params): Params =>
        route.decodeParams?.(params) ?? params;
    }

    if (route.encodeParams) {
      this.#config.encoders[fullName] = (params: Params): Params =>
        route.encodeParams?.(params) ?? params;
    }

    // Register defaults
    if (route.defaultParams) {
      this.#config.defaultParams[fullName] = route.defaultParams;
    }
  }

  #registerForwardTo(route: Route<Dependencies>, fullName: string): void {
    if (route.canActivate) {
      /* v8 ignore next -- @preserve: edge case, both string and function tested separately */
      const forwardTarget =
        typeof route.forwardTo === "string" ? route.forwardTo : "[dynamic]";

      logger.warn(
        "real-router",
        `Route "${fullName}" has both forwardTo and canActivate. ` +
          `canActivate will be ignored because forwardTo creates a redirect (industry standard). ` +
          `Move canActivate to the target route "${forwardTarget}".`,
      );
    }

    if (route.canDeactivate) {
      /* v8 ignore next -- @preserve: edge case, both string and function tested separately */
      const forwardTarget =
        typeof route.forwardTo === "string" ? route.forwardTo : "[dynamic]";

      logger.warn(
        "real-router",
        `Route "${fullName}" has both forwardTo and canDeactivate. ` +
          `canDeactivate will be ignored because forwardTo creates a redirect (industry standard). ` +
          `Move canDeactivate to the target route "${forwardTarget}".`,
      );
    }

    // Async validation ALWAYS runs (even with noValidate=true)
    if (typeof route.forwardTo === "function") {
      const isNativeAsync =
        (route.forwardTo as { constructor: { name: string } }).constructor
          .name === "AsyncFunction";
      const isTranspiledAsync = route.forwardTo
        .toString()
        .includes("__awaiter");

      if (isNativeAsync || isTranspiledAsync) {
        throw new TypeError(
          `forwardTo callback cannot be async for route "${fullName}". ` +
            `Async functions break matchPath/buildPath.`,
        );
      }
    }

    // forwardTo is guaranteed to exist at this point
    if (typeof route.forwardTo === "string") {
      this.#config.forwardMap[fullName] = route.forwardTo;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.#config.forwardFnMap[fullName] = route.forwardTo!;
    }
  }

  #enrichRoute(
    routeDef: RouteDefinition,
    routeName: string,
  ): Route<Dependencies> {
    const route: Route<Dependencies> = {
      name: routeDef.name,
      path: routeDef.path,
    };

    const forwardToFn = this.#config.forwardFnMap[routeName];
    const forwardToStr = this.#config.forwardMap[routeName];

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (forwardToFn !== undefined) {
      route.forwardTo = forwardToFn;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    } else if (forwardToStr !== undefined) {
      route.forwardTo = forwardToStr;
    }

    if (routeName in this.#config.defaultParams) {
      route.defaultParams = this.#config.defaultParams[routeName];
    }

    if (routeName in this.#config.decoders) {
      route.decodeParams = this.#config.decoders[routeName];
    }

    if (routeName in this.#config.encoders) {
      route.encodeParams = this.#config.encoders[routeName];
    }

    /* v8 ignore next -- @preserve unreachable: Router always sets lifecycleNamespace */
    if (this.#lifecycleNamespace) {
      const [canDeactivateFactories, canActivateFactories] =
        this.#lifecycleNamespace.getFactories();

      if (routeName in canActivateFactories) {
        route.canActivate = canActivateFactories[routeName];
      }

      if (routeName in canDeactivateFactories) {
        route.canDeactivate = canDeactivateFactories[routeName];
      }
    }

    if (routeDef.children) {
      route.children = routeDef.children.map((child) =>
        this.#enrichRoute(child, `${routeName}.${child.name}`),
      );
    }

    return route;
  }
}
