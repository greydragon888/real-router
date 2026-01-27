// packages/core/src/namespaces/RoutesNamespace/RoutesNamespace.ts

import { logger } from "@real-router/logger";
import {
  createRouteTree,
  getSegmentsByName,
  hasSegmentsByName,
  nodeToDefinition,
  matchSegments,
  buildPath as routeNodeBuildPath,
  routeTreeToDefinitions,
} from "route-tree";
import {
  isString,
  validateRouteName,
  isParams,
  getTypeDescription,
} from "type-guards";

import { constants } from "@real-router/core";

import { DEFAULT_ROUTE_NAME, validatedRouteNames } from "./constants";
import { createEmptyConfig } from "./helpers";
import { createRouteState } from "../../core/stateBuilder";
import { createBuildOptions } from "../../helpers";
import { getTransitionPath } from "../../transitionPath";

import type { RouteConfig } from "./types";
import type { RouteLifecycleNamespace } from "../RouteLifecycleNamespace";
import type {
  ActivationFnFactory,
  DefaultDependencies,
  Options,
  Params,
  Route,
  Router,
  State,
} from "@real-router/types";
import type {
  BuildOptions,
  MatchOptions,
  RouteDefinition,
  RouteTree,
} from "route-tree";

/**
 * Creates RouteNode match options from real-router options.
 */
function createMatchOptions(options: Options): MatchOptions {
  return {
    ...createBuildOptions(options),
    caseSensitive: options.caseSensitive,
    strictTrailingSlash: options.trailingSlash === "strict",
    strongMatching: false,
  };
}

/**
 * Checks if all params from source exist with same values in target.
 * Small function body allows V8 inlining.
 */
function paramsMatch(source: Params, target: Params): boolean {
  for (const key in source) {
    if (source[key] !== target[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Checks params match, skipping keys present in skipKeys.
 */
function paramsMatchExcluding(
  source: Params,
  target: Params,
  skipKeys: Params,
): boolean {
  for (const key in source) {
    if (key in skipKeys) {
      continue;
    }
    if (source[key] !== target[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Sanitizes a route by keeping only essential properties.
 */
function sanitizeRoute<Dependencies extends DefaultDependencies>(
  route: Route<Dependencies>,
): RouteDefinition {
  const sanitized: RouteDefinition = {
    name: route.name,
    path: route.path,
  };

  if (route.children) {
    sanitized.children = route.children.map((child) => sanitizeRoute(child));
  }

  return sanitized;
}

/**
 * Recursively removes a route from definitions array.
 */
function removeFromDefinitions(
  definitions: RouteDefinition[],
  routeName: string,
  parentPrefix = "",
): boolean {
  for (let i = 0; i < definitions.length; i++) {
    const route = definitions[i];
    const fullName = parentPrefix
      ? `${parentPrefix}.${route.name}`
      : route.name;

    if (fullName === routeName) {
      definitions.splice(i, 1);

      return true;
    }

    if (
      route.children &&
      routeName.startsWith(`${fullName}.`) &&
      removeFromDefinitions(route.children, routeName, fullName)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Clears configuration entries that match the predicate.
 */
function clearConfigEntries<T>(
  config: Record<string, T>,
  matcher: (key: string) => boolean,
): void {
  for (const key of Object.keys(config)) {
    if (matcher(key)) {
      delete config[key];
    }
  }
}

/**
 * Resolves a forwardTo chain to its final destination.
 */
function resolveForwardChain(
  startRoute: string,
  forwardMap: Record<string, string>,
  maxDepth = 100,
): string {
  const visited = new Set<string>();
  const chain: string[] = [startRoute];
  let current = startRoute;

  while (forwardMap[current]) {
    const next = forwardMap[current];

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

  return current;
}

/**
 * Independent namespace for managing routes.
 *
 * Static methods handle validation (called by facade).
 * Instance methods handle storage and business logic.
 */
export class RoutesNamespace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
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

  #rootPath = "";
  #tree: RouteTree;
  #buildOptionsCache: BuildOptions | undefined;

  // Router reference for route handlers (set after construction)
  #router: Router<Dependencies> | undefined;

  // Lifecycle handlers reference (set after construction)
  #lifecycleNamespace: RouteLifecycleNamespace<Dependencies> | undefined;

  constructor(routes: Route<Dependencies>[] = []) {
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

    // Register handlers for all routes (defaultParams, encoders, decoders, forwardTo)
    // Note: canActivate handlers are registered later when #lifecycleNamespace is set
    this.#registerAllRouteHandlers(routes);

    // Validate and cache forwardTo chains (detect cycles)
    this.#validateAndCacheForwardMap();
  }

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // =========================================================================

  /**
   * Validates route name format.
   */
  static validateRouteName(
    name: unknown,
    methodName: string,
  ): asserts name is string {
    validateRouteName(name, methodName);
  }

  /**
   * Validates params structure.
   */
  static validateParams(
    params: unknown,
    methodName: string,
  ): asserts params is Params {
    if (!isParams(params)) {
      throw new TypeError(
        `[router.${methodName}] Invalid params structure: ${getTypeDescription(params)}`,
      );
    }
  }

  // =========================================================================
  // Dependency injection
  // =========================================================================

  /**
   * Sets the router reference and registers pending canActivate handlers.
   * canActivate handlers from initial routes are deferred until router is set.
   */
  setRouter(router: Router<Dependencies>): void {
    this.#router = router;

    // Register pending canActivate handlers that were deferred during construction
    for (const [routeName, handler] of this.#pendingCanActivate) {
      router.canActivate(routeName, handler);
    }

    // Clear pending handlers after registration
    this.#pendingCanActivate.clear();
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
   * Returns the route tree.
   */
  getTree(): RouteTree {
    return this.#tree;
  }

  /**
   * Returns the root path.
   */
  getRootPath(): string {
    return this.#rootPath;
  }

  /**
   * Sets the root path and rebuilds the tree.
   */
  setRootPath(newRootPath: string): void {
    this.#rootPath = newRootPath;
    this.#rebuildTree(true);
  }

  /**
   * Checks if a route exists.
   */
  hasRoute(name: string): boolean {
    return hasSegmentsByName(this.#tree, name);
  }

  /**
   * Gets a route by name with all its configuration.
   */
  getRoute(name: string): Route<Dependencies> | undefined {
    const segments = getSegmentsByName(this.#tree, name);

    if (!segments) {
      return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const targetNode = segments.at(-1)!;
    const definition = nodeToDefinition(targetNode);

    return this.#enrichRoute(definition, name);
  }

  /**
   * Adds one or more routes to the router.
   *
   * @param routes - Already validated routes
   */
  addRoutes(routes: Route<Dependencies>[]): void {
    // Add to definitions
    for (const route of routes) {
      this.#definitions.push(sanitizeRoute(route));
    }

    // Register handlers
    this.#registerAllRouteHandlers(routes);

    // Rebuild tree
    this.#rebuildTree(true);

    // Validate and cache forwardTo chains
    this.#validateAndCacheForwardMap();
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
    this.#rebuildTree(true);

    // Revalidate forward chains
    this.#validateAndCacheForwardMap();

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
  // eslint-disable-next-line sonarjs/cognitive-complexity -- simple config updates
  updateRouteConfig(
    name: string,
    updates: {
      forwardTo?: string | null | undefined;
      defaultParams?: Params | null | undefined;
      decodeParams?: ((params: Params) => Params) | null | undefined;
      encodeParams?: ((params: Params) => Params) | null | undefined;
    },
  ): void {
    // Update forwardTo
    if (updates.forwardTo !== undefined) {
      if (updates.forwardTo === null) {
        delete this.#config.forwardMap[name];
      } else {
        this.#config.forwardMap[name] = updates.forwardTo;
      }

      this.#validateAndCacheForwardMap();
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

    // Clear forward cache
    for (const key in this.#resolvedForwardMap) {
      delete this.#resolvedForwardMap[key];
    }

    // Rebuild empty tree
    this.#rebuildTree(true);
  }

  // =========================================================================
  // Path operations
  // =========================================================================

  /**
   * Builds a URL path for a route.
   */
  buildPath(route: string, params?: Params, options?: Options): string {
    if (!isString(route) || route === "") {
      throw new TypeError(
        `[real-router] buildPath: route must be a non-empty string, got ${typeof route === "string" ? '""' : typeof route}`,
      );
    }

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

    // Use cached buildOptions if available
    const buildOptions =
      this.#buildOptionsCache ??
      createBuildOptions(options ?? this.#getDefaultOptions());

    return routeNodeBuildPath(this.#tree, route, encodedParams, buildOptions);
  }

  /**
   * Matches a URL path to a route in the tree.
   */
  matchPath<P extends Params = Params, MP extends Params = Params>(
    path: string,
    source?: string,
    options?: Options,
  ): State<P, MP> | undefined {
    if (!isString(path)) {
      throw new TypeError(
        `[real-router] matchPath: path must be a string, got ${typeof path}`,
      );
    }

    const opts = options ?? this.#getDefaultOptions();
    const matchOptions = createMatchOptions(opts);
    const matchResult = matchSegments(this.#tree, path, matchOptions);

    if (matchResult) {
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

      const builtPath = opts.rewritePathOnMatch
        ? this.buildPath(routeName, routeParams, opts)
        : path;

      // Create state using router's makeState if available
      if (this.#router) {
        return this.#router.makeState<P, MP>(
          routeName,
          routeParams,
          builtPath,
          {
            params: meta as MP,
            options: {},
            source,
            redirected: false,
          },
        );
      }

      // Fallback if router not set
      return {
        name: routeName,
        params: routeParams,
        path: builtPath,
        meta: {
          params: meta as MP,
          options: {},
          source,
          redirected: false,
        },
      } as State<P, MP>;
    }

    return undefined;
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
    const resolvedName = this.#resolvedForwardMap[name] ?? name;

    // Merge source route's defaultParams with provided params
    const paramsWithSource = Object.hasOwn(this.#config.defaultParams, name)
      ? { ...this.#config.defaultParams[name], ...params }
      : { ...params };

    // If forwarded to different route, merge target's defaultParams
    if (
      resolvedName !== name &&
      Object.hasOwn(this.#config.defaultParams, resolvedName)
    ) {
      return {
        name: resolvedName,
        params: {
          ...this.#config.defaultParams[resolvedName],
          ...paramsWithSource,
        } as P,
      };
    }

    return { name: resolvedName, params: paramsWithSource };
  }

  /**
   * Initializes buildOptions cache.
   * Called from routerLifecycle at router.start().
   */
  initBuildOptionsCache(options: Options): void {
    this.#buildOptionsCache = createBuildOptions(options);
  }

  /**
   * Clears buildOptions cache.
   * Called from routerLifecycle at router.stop().
   */
  clearBuildOptionsCache(): void {
    this.#buildOptionsCache = undefined;
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

    // Warn about empty string usage
    if (name === "") {
      logger.warn(
        "real-router",
        'isActiveRoute("") called with empty string. ' +
          "The root node is not considered active for any named route. " +
          "To check if router has active state, use: router.getState() !== undefined",
      );

      return false;
    }

    const activeState = this.#router?.getState();

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

      return (
        this.#router?.areStatesEqual(
          targetState,
          activeState,
          ignoreQueryParams,
        ) ?? false
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
   */
  shouldUpdateNode(
    nodeName: string,
  ): (toState: State, fromState?: State) => boolean {
    if (!isString(nodeName)) {
      throw new TypeError(
        `[router.shouldUpdateNode] nodeName must be a string, got ${typeof nodeName}`,
      );
    }

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
   * Returns the resolved forward map.
   */
  getResolvedForwardMap(): Record<string, string> {
    return this.#resolvedForwardMap;
  }

  /**
   * Sets config (used by clone).
   */
  setConfig(config: RouteConfig): void {
    Object.assign(this.#config.decoders, config.decoders);
    Object.assign(this.#config.encoders, config.encoders);
    Object.assign(this.#config.defaultParams, config.defaultParams);
    Object.assign(this.#config.forwardMap, config.forwardMap);
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

  /**
   * Returns a deep clone of stored route definitions.
   * Preserves original structure including empty children arrays.
   */
  getDefinitions(): RouteDefinition[] {
    return structuredClone(this.#definitions);
  }

  // =========================================================================
  // Private methods
  // =========================================================================

  #rebuildTree(skipValidation = false): void {
    this.#tree = createRouteTree(
      DEFAULT_ROUTE_NAME,
      this.#rootPath,
      this.#definitions,
      { skipValidation },
    );
  }

  #getDefaultOptions(): Options {
    // Use router's options if available, otherwise return minimal defaults
    return (
      this.#router?.getOptions() ?? {
        defaultRoute: "",
        defaultParams: {},
        queryParams: {
          nullFormat: "default",
          arrayFormat: "none",
          booleanFormat: "none",
        },
        caseSensitive: false,
        trailingSlash: "preserve",
        urlParamsEncoding: "default",
        queryParamsMode: "loose",
        allowNotFound: true,
        rewritePathOnMatch: true,
      }
    );
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

  #clearRouteConfigurations(routeName: string): void {
    const shouldClear = (n: string): boolean =>
      n === routeName || n.startsWith(`${routeName}.`);

    clearConfigEntries(this.#config.decoders, shouldClear);
    clearConfigEntries(this.#config.encoders, shouldClear);
    clearConfigEntries(this.#config.defaultParams, shouldClear);
    clearConfigEntries(this.#config.forwardMap, shouldClear);

    // Clear forwardMap entries pointing TO deleted route
    clearConfigEntries(this.#config.forwardMap, (key) =>
      shouldClear(this.#config.forwardMap[key]),
    );

    // Clear lifecycle handlers if namespace is set
    if (this.#lifecycleNamespace) {
      const [canDeactivateFactories, canActivateFactories] =
        this.#lifecycleNamespace.getFactories();

      for (const n of Object.keys(canActivateFactories)) {
        if (shouldClear(n)) {
          this.#lifecycleNamespace.clearCanActivate(n, true);
        }
      }

      for (const n of Object.keys(canDeactivateFactories)) {
        if (shouldClear(n)) {
          this.#lifecycleNamespace.clearCanDeactivate(n, true);
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
    // Register canActivate via router API (allows tests to spy on router.canActivate)
    if (route.canActivate) {
      if (this.#router) {
        // Router is available, register immediately
        this.#router.canActivate(fullName, route.canActivate);
      } else {
        // Router not set yet, store for later registration
        this.#pendingCanActivate.set(fullName, route.canActivate);
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
      logger.warn(
        "real-router",
        `Route "${fullName}" has both forwardTo and canActivate. ` +
          `canActivate will be ignored because forwardTo creates a redirect (industry standard). ` +
          `Move canActivate to the target route "${route.forwardTo}".`,
      );
    }

    // forwardTo is guaranteed to exist at this point
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.#config.forwardMap[fullName] = route.forwardTo!;
  }

  #enrichRoute(
    routeDef: RouteDefinition,
    routeName: string,
  ): Route<Dependencies> {
    const route: Route<Dependencies> = {
      name: routeDef.name,
      path: routeDef.path,
    };

    const forwardTo = this.#config.forwardMap[routeName];

    if (forwardTo) {
      route.forwardTo = forwardTo;
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

    if (this.#lifecycleNamespace) {
      const [, canActivateFactories] = this.#lifecycleNamespace.getFactories();

      if (routeName in canActivateFactories) {
        route.canActivate = canActivateFactories[routeName];
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
