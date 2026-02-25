// packages/core/src/namespaces/RoutesNamespace/RoutesNamespace.ts

import { routeTreeToDefinitions } from "route-tree";
import { isString, validateRouteName } from "type-guards";

import { DEFAULT_ROUTE_NAME, validatedRouteNames } from "./constants";
import {
  createEmptyConfig,
  paramsMatch,
  paramsMatchExcluding,
  sanitizeRoute,
} from "./helpers";
import {
  cacheForwardMap,
  rebuildTree,
  registerAllRouteHandlers,
  validateAndCacheForwardMap,
} from "./routeTreeOps";
import { createRouteState } from "./stateBuilder";
import {
  validateAddRouteArgs,
  validateIsActiveRouteArgs,
  validateStateBuilderArgs,
  validateBuildPathArgs,
  validateShouldUpdateNodeArgs,
  validateRoutes,
} from "./validators";
import { constants } from "../../constants";
import { getTransitionPath } from "../../transitionPath";

import type { RouteConfig, RoutesDependencies } from "./types";
import type {
  BuildStateResultWithSegments,
  GuardFnFactory,
  Route,
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
  #resolvedForwardMap: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;

  #routeCustomFields: Record<string, Record<string, unknown>> = Object.create(
    null,
  ) as Record<string, Record<string, unknown>>;

  // Pending canActivate handlers that need to be registered after router is set
  // Key: route name, Value: canActivate factory
  readonly #pendingCanActivate = new Map<
    string,
    GuardFnFactory<Dependencies>
  >();

  // Pending canDeactivate handlers that need to be registered after router is set
  // Key: route name, Value: canDeactivate factory
  readonly #pendingCanDeactivate = new Map<
    string,
    GuardFnFactory<Dependencies>
  >();

  #rootPath = "";
  #tree: RouteTree;
  #matcher: Matcher;
  readonly #matcherOptions: CreateMatcherOptions | undefined;

  // Dependencies injected via setDependencies (for facade method calls)
  #depsStore: RoutesDependencies<Dependencies> | undefined;

  // Lifecycle handlers reference (set after construction)
  #lifecycleNamespace!: RouteLifecycleNamespace<Dependencies>;

  /**
   * Gets dependencies or throws if not initialized.
   */
  get #deps(): RoutesDependencies<Dependencies> {
    /* v8 ignore next 3 -- @preserve: defensive guard, unreachable via public API (RouterWiringBuilder always calls setDependencies) */
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
    this.#matcherOptions = matcherOptions;

    // Sanitize routes to store only essential properties
    for (const route of routes) {
      this.#definitions.push(sanitizeRoute(route));
    }

    // Create initial tree
    const treeResult = rebuildTree(
      this.#definitions,
      this.#rootPath,
      this.#matcherOptions,
    );

    this.#tree = treeResult.tree;
    this.#matcher = treeResult.matcher;

    // Register handlers for all routes (defaultParams, encoders, decoders, forwardTo)
    // Note: canActivate handlers are registered later when #lifecycleNamespace is set
    registerAllRouteHandlers(
      routes,
      this.#config,
      this.#routeCustomFields,
      this.#pendingCanActivate,
      this.#pendingCanDeactivate,
      undefined,
      "",
    );

    // Validate and cache forwardTo chains (detect cycles)
    // Skip validation in noValidate mode for production performance
    this.#resolvedForwardMap = noValidate
      ? cacheForwardMap(this.#config)
      : validateAndCacheForwardMap(this.#config);
  }

  // =========================================================================
  // Static validation methods (delegated to validators.ts)
  // TypeScript requires explicit method declarations for assertion functions
  // =========================================================================

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

  static validateBuildPathArgs(route: unknown): asserts route is string {
    validateBuildPathArgs(route);
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
    parentName?: string,
  ): void {
    validateRoutes(routes, tree, forwardMap, parentName);
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.#lifecycleNamespace = namespace!;
  }

  getLifecycleNamespace(): RouteLifecycleNamespace<Dependencies> {
    return this.#lifecycleNamespace;
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
    const result = rebuildTree(
      this.#definitions,
      this.#rootPath,
      this.#matcherOptions,
    );

    this.#tree = result.tree;
    this.#matcher = result.matcher;
  }

  /**
   * Checks if a route exists.
   */
  hasRoute(name: string): boolean {
    return this.#matcher.hasRoute(name);
  }

  getRouteCustomFields(): Record<string, Record<string, unknown>> {
    return this.#routeCustomFields;
  }

  /**
   * Clears all routes from the router.
   */
  clearRoutes(): void {
    this.#definitions.length = 0;

    // Reset config to empty null-prototype objects
    Object.assign(this.#config, createEmptyConfig());

    // Clear forward cache
    this.#resolvedForwardMap = Object.create(null) as Record<string, string>;
    this.#routeCustomFields = Object.create(null) as Record<
      string,
      Record<string, unknown>
    >;

    // Rebuild empty tree
    const clearResult = rebuildTree(
      this.#definitions,
      this.#rootPath,
      this.#matcherOptions,
    );

    this.#tree = clearResult.tree;
    this.#matcher = clearResult.matcher;
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

    const { name: routeName, params: routeParams } = this.#deps.forwardState<P>(
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

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const meta = this.#matcher.getMetaByName(resolvedName)!;

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

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const meta = this.#matcher.getMetaByName(resolvedName)!;
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
   * Applies cloned route config from source router.
   * Used by clone to copy decoders, encoders, defaultParams, forwardMap,
   * forwardFnMap and resolvedForwardMap into this namespace's config.
   */
  applyClonedConfig(
    config: RouteConfig,
    resolvedForwardMap: Record<string, string>,
    routeCustomFields: Record<string, Record<string, unknown>>,
  ): void {
    Object.assign(this.#config.decoders, config.decoders);
    Object.assign(this.#config.encoders, config.encoders);
    Object.assign(this.#config.defaultParams, config.defaultParams);
    Object.assign(this.#config.forwardMap, config.forwardMap);
    Object.assign(this.#config.forwardFnMap, config.forwardFnMap);
    this.setResolvedForwardMap({ ...resolvedForwardMap });
    Object.assign(this.#routeCustomFields, routeCustomFields);
  }

  /**
   * Creates a clone of the routes for a new router (from tree).
   */
  cloneRoutes(): Route<Dependencies>[] {
    return routeTreeToDefinitions(this.#tree) as Route<Dependencies>[];
  }

  // =========================================================================
  // Internal accessors (for RouterInternals raw data exposure)
  // =========================================================================

  getDefinitions(): RouteDefinition[] {
    return this.#definitions;
  }
  getConfigInternal(): RouteConfig {
    return this.#config;
  }
  getMatcherOptions(): CreateMatcherOptions | undefined {
    return this.#matcherOptions;
  }
  /* v8 ignore next 3 -- @preserve: called via routeSetCustomFields in Router.getInternals(), tested via plugin integration tests */
  setRouteCustomFields(fields: Record<string, Record<string, unknown>>): void {
    this.#routeCustomFields = fields;
  }
  getMatcher(): Matcher {
    return this.#matcher;
  }
  setTreeAndMatcher(tree: RouteTree, matcher: Matcher): void {
    this.#tree = tree;
    this.#matcher = matcher;
  }
  replaceResolvedForwardMap(map: Record<string, string>): void {
    this.#resolvedForwardMap = map;
  }
  getDepsStore(): RoutesDependencies<Dependencies> | undefined {
    return this.#depsStore;
  }
  getPendingCanActivate(): Map<string, GuardFnFactory<Dependencies>> {
    return this.#pendingCanActivate;
  }
  getPendingCanDeactivate(): Map<string, GuardFnFactory<Dependencies>> {
    return this.#pendingCanDeactivate;
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
}
