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
  validateRoute,
} from "route-tree";
import {
  isString,
  validateRouteName,
  isParams,
  getTypeDescription,
} from "type-guards";

import { constants } from "@real-router/core";

import { DEFAULT_ROUTE_NAME, validatedRouteNames } from "./constants";
import {
  createEmptyConfig,
  validateRouteProperties,
  validateForwardToTargets,
} from "./helpers";
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
  RouteConfigUpdate,
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
   * Validates removeRoute arguments.
   */
  static validateRemoveRouteArgs(name: unknown): asserts name is string {
    validateRouteName(name, "removeRoute");
  }

  /**
   * Validates setRootPath arguments.
   */
  static validateSetRootPathArgs(
    rootPath: unknown,
  ): asserts rootPath is string {
    if (typeof rootPath !== "string") {
      throw new TypeError(
        `[router.setRootPath] rootPath must be a string, got ${getTypeDescription(rootPath)}`,
      );
    }
  }

  /**
   * Validates addRoute arguments (route structure and properties).
   * State-dependent validation (duplicates, tree) happens in instance method.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any Route type
  static validateAddRouteArgs(routes: readonly Route<any>[]): void {
    for (const route of routes) {
      // First check if route is an object (before accessing route.name)
      // Runtime check for invalid types passed via `as any`
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime check
      if (route === null || typeof route !== "object" || Array.isArray(route)) {
        throw new TypeError(
          `[router.addRoute] Route must be an object, got ${getTypeDescription(route)}`,
        );
      }

      // Validate route properties (canActivate, canDeactivate, defaultParams, async checks)
      // Note: validateRouteProperties handles children recursively
      validateRouteProperties(route, route.name);
    }
  }

  /**
   * Validates isActiveRoute arguments.
   */
  static validateIsActiveRouteArgs(
    name: unknown,
    params: unknown,
    strictEquality: unknown,
    ignoreQueryParams: unknown,
  ): void {
    // Validate name - non-string throws
    if (!isString(name)) {
      throw new TypeError(`Route name must be a string`);
    }

    // Validate params if provided
    if (params !== undefined && !isParams(params)) {
      throw new TypeError(`[router.isActiveRoute] Invalid params structure`);
    }

    // Validate strictEquality if provided
    if (strictEquality !== undefined && typeof strictEquality !== "boolean") {
      throw new TypeError(
        `[router.isActiveRoute] strictEquality must be a boolean, got ${typeof strictEquality}`,
      );
    }

    // Validate ignoreQueryParams if provided
    if (
      ignoreQueryParams !== undefined &&
      typeof ignoreQueryParams !== "boolean"
    ) {
      throw new TypeError(
        `[router.isActiveRoute] ignoreQueryParams must be a boolean, got ${typeof ignoreQueryParams}`,
      );
    }
  }

  /**
   * Validates forward() arguments.
   */
  static validateForwardArgs(
    fromRoute: unknown,
    toRoute: unknown,
  ): asserts fromRoute is string {
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
  }

  /**
   * Validates forwardState/buildState arguments.
   */
  static validateStateBuilderArgs(
    routeName: unknown,
    routeParams: unknown,
    methodName: string,
  ): void {
    if (!isString(routeName)) {
      throw new TypeError(
        `[router.${methodName}] Invalid routeName: ${getTypeDescription(routeName)}. Expected string.`,
      );
    }

    if (!isParams(routeParams)) {
      throw new TypeError(
        `[router.${methodName}] Invalid routeParams: ${getTypeDescription(routeParams)}. Expected plain object.`,
      );
    }
  }

  /**
   * Validates updateRoute basic arguments (name and updates object structure).
   * Does NOT read property values to allow caller to cache them first.
   */
  static validateUpdateRouteBasicArgs<Dependencies extends DefaultDependencies>(
    name: unknown,
    updates: unknown,
  ): asserts updates is RouteConfigUpdate<Dependencies> {
    // Validate name
    validateRouteName(name, "updateRoute");

    if (name === "") {
      throw new ReferenceError(
        `[router.updateRoute] Invalid name: empty string. Cannot update root node.`,
      );
    }

    // Validate updates is not null

    if (updates === null) {
      throw new TypeError(
        `[real-router] updateRoute: updates must be an object, got null`,
      );
    }

    // Validate updates is an object (not array)
    if (typeof updates !== "object" || Array.isArray(updates)) {
      throw new TypeError(
        `[real-router] updateRoute: updates must be an object, got ${getTypeDescription(updates)}`,
      );
    }
  }

  /**
   * Validates updateRoute property types using pre-cached values.
   * Called AFTER properties are cached to ensure getters are called only once.
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity -- validation logic is naturally verbose
  static validateUpdateRoutePropertyTypes(
    forwardTo: unknown,
    defaultParams: unknown,
    decodeParams: unknown,
    encodeParams: unknown,
  ): void {
    // Validate forwardTo type (existence check is done by instance method)
    if (forwardTo !== undefined && forwardTo !== null && !isString(forwardTo)) {
      throw new TypeError(
        `[real-router] updateRoute: forwardTo must be a string or null, got ${getTypeDescription(forwardTo)}`,
      );
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
        (decodeParams as { constructor: { name: string } }).constructor.name ===
          "AsyncFunction" ||
        (decodeParams as { toString: () => string })
          .toString()
          .includes("__awaiter")
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
        (encodeParams as { constructor: { name: string } }).constructor.name ===
          "AsyncFunction" ||
        (encodeParams as { toString: () => string })
          .toString()
          .includes("__awaiter")
      ) {
        throw new TypeError(
          `[real-router] updateRoute: encodeParams cannot be an async function`,
        );
      }
    }
  }

  /**
   * Validates buildPath arguments.
   */
  static validateBuildPathArgs(route: unknown): asserts route is string {
    if (!isString(route) || route === "") {
      throw new TypeError(
        `[real-router] buildPath: route must be a non-empty string, got ${typeof route === "string" ? '""' : typeof route}`,
      );
    }
  }

  /**
   * Validates matchPath arguments.
   */
  static validateMatchPathArgs(path: unknown): asserts path is string {
    if (!isString(path)) {
      throw new TypeError(
        `[real-router] matchPath: path must be a string, got ${typeof path}`,
      );
    }
  }

  /**
   * Validates shouldUpdateNode arguments.
   */
  static validateShouldUpdateNodeArgs(
    nodeName: unknown,
  ): asserts nodeName is string {
    if (!isString(nodeName)) {
      throw new TypeError(
        `[router.shouldUpdateNode] nodeName must be a string, got ${typeof nodeName}`,
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
   * Validates all routes before adding them.
   *
   * @param routes - Routes to add
   */
  addRoutes(routes: Route<Dependencies>[]): void {
    // Validate all routes before any mutation
    this.#validateRoutes(routes);

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
   * Note: Argument validation is done by facade (Router.ts) via validateBuildPathArgs.
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

    // Use cached buildOptions if available
    const buildOptions =
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Router.ts always passes options
      this.#buildOptionsCache ?? createBuildOptions(options!);

    return routeNodeBuildPath(this.#tree, route, encodedParams, buildOptions);
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

      // Create state using router's makeState
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- router is always set by Router.ts
      return this.#router!.makeState<P, MP>(routeName, routeParams, builtPath, {
        params: meta as MP,
        options: {},
        source,
        redirected: false,
      });
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

    // Note: empty string check is handled by Router.ts facade
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- router is always set by Router.ts
    const activeState = this.#router!.getState();

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
        /* v8 ignore next -- @preserve unreachable: #router always set by Router constructor */
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
   * Used by updateRoute and forward for forwardTo validation.
   */
  validateForwardToParamCompatibility(
    sourceName: string,
    targetName: string,
    methodName: "forward" | "updateRoute" = "updateRoute",
  ): void {
    // Note: hasRoute() is always called before this method, so segments are guaranteed to exist
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- hasRoute() validates existence
    const sourceSegments = getSegmentsByName(this.#tree, sourceName)!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- hasRoute() validates existence
    const targetSegments = getSegmentsByName(this.#tree, targetName)!;

    // Get source and target URL params using helper
    const sourceParams = this.#collectUrlParams(sourceSegments);
    const targetParams = this.#collectUrlParamsArray(targetSegments);

    // Check if target requires params that source doesn't have
    const missingParams = targetParams.filter(
      (param) => !sourceParams.has(param),
    );

    if (missingParams.length > 0) {
      const targetDesc =
        methodName === "forward" ? "target route" : "forwardTo target";

      throw new Error(
        `[real-router] ${methodName}: ${targetDesc} "${targetName}" requires params ` +
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
    forwardTo: string | null | undefined,
  ): void {
    // Validate route exists
    if (!this.hasRoute(name)) {
      throw new ReferenceError(
        `[real-router] updateRoute: route "${name}" does not exist`,
      );
    }

    // Validate forwardTo target exists and is valid
    if (forwardTo !== undefined && forwardTo !== null) {
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

  /**
   * Registers a forward mapping from one route to another.
   * Validates route existence, param compatibility, and cycles before mutation.
   */
  forward(fromRoute: string, toRoute: string): void {
    // Validate source route exists
    if (!this.hasRoute(fromRoute)) {
      throw new Error(
        `[real-router] forward: source route "${fromRoute}" does not exist`,
      );
    }

    // Validate target route exists
    if (!this.hasRoute(toRoute)) {
      throw new Error(
        `[real-router] forward: target route "${toRoute}" does not exist`,
      );
    }

    // Validate param compatibility
    this.validateForwardToParamCompatibility(fromRoute, toRoute, "forward");

    // Validate no cycles would be created
    this.validateForwardToCycle(fromRoute, toRoute);

    // Add forward mapping
    this.#config.forwardMap[fromRoute] = toRoute;

    // Rebuild resolved forward map entry
    // resolveForwardChain handles the chain resolution
    this.#resolvedForwardMap[fromRoute] = resolveForwardChain(
      fromRoute,
      this.#config.forwardMap,
    );
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

  /**
   * Collects URL params from segments into a Set.
   *
   * @param segments - Non-null segments (caller must validate existence first)
   */
  #collectUrlParams(segments: readonly RouteTree[]): Set<string> {
    const params = new Set<string>();

    for (const segment of segments) {
      // Named routes always have parsers (null only for root without path)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- route-tree guarantees parser for named routes
      for (const param of segment.parser!.urlParams) {
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
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- route-tree guarantees parser for named routes
      for (const param of segment.parser!.urlParams) {
        params.push(param);
      }
    }

    return params;
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
    /* v8 ignore next -- @preserve unreachable: Router always sets lifecycleNamespace */
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

    /* v8 ignore next -- @preserve unreachable: Router always sets lifecycleNamespace */
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

  // =========================================================================
  // Route Validation Methods
  // =========================================================================

  /**
   * Validates routes before adding them to the router.
   * Uses centralized validation functions from route-tree and helpers.
   *
   * @param routes - Routes to validate
   */
  #validateRoutes(routes: Route<Dependencies>[]): void {
    // State-dependent validation (requires access to #tree and #config)
    // Property validation is done in static validateAddRouteArgs (called by facade)

    // Tracking sets for duplicate detection
    const seenNames = new Set<string>();
    const seenPathsByParent = new Map<string, Set<string>>();

    for (const route of routes) {
      // Use route-tree's validateRoute for structural validation
      // (type, name, path, duplicates, parent exists, children array)
      // Note: validateRoute handles children recursively
      validateRoute(
        route,
        "addRoute",
        this.#tree,
        "",
        seenNames,
        seenPathsByParent,
      );
    }

    // Validate forwardTo targets and cycles
    validateForwardToTargets(routes, this.#config.forwardMap, this.#tree);
  }
}
