// packages/real-router/modules/core/state.ts

import { logger } from "@real-router/logger";
import { getSegmentsByName } from "route-tree";
import {
  isNavigationOptions,
  isParams,
  isString,
  validateState,
  getTypeDescription,
} from "type-guards";

import { constants } from "@real-router/core";

import { freezeStateInPlace } from "../helpers";
import { getConfig, getResolvedForwardMap, getRouteTree } from "../internals";
import { createRouteState } from "./stateBuilder";

import type {
  BuildStateResultWithSegments,
  DefaultDependencies,
  NavigationOptions,
  Params,
  Router,
  SimpleState,
  State,
  StateMetaInput,
} from "core-types";
import type { RouteTree, RouteTreeState, RouteTreeStateMeta } from "route-tree";

/**
 * Extracts URL param names from RouteTreeStateMeta.
 * This is an O(segments × params) operation but avoids tree traversal.
 *
 * @param meta - RouteTreeStateMeta containing param sources
 * @returns Array of URL param names
 *
 * @internal
 */
function getUrlParamsFromMeta(meta: RouteTreeStateMeta): string[] {
  const urlParams: string[] = [];

  // meta structure: { "segment1": { param1: "url", param2: "query" }, ... }
  // Optimization: use for...in instead of Object.entries to avoid array allocation
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
 *
 * @param val1 - First value
 * @param val2 - Second value
 * @returns True if values are equal
 */
function areParamValuesEqual(val1: unknown, val2: unknown): boolean {
  // Fast path: strict equality for primitives and same references
  if (val1 === val2) {
    return true;
  }

  // Deep equality for arrays
  if (Array.isArray(val1) && Array.isArray(val2)) {
    if (val1.length !== val2.length) {
      return false;
    }

    return val1.every((v, i) => areParamValuesEqual(v, val2[i]));
  }

  // Different types or non-equal non-arrays
  return false;
}

/**
 * Enhances router with state management capabilities.
 *
 * Provides methods for getting, setting, and comparing route states.
 * Implements frozen state caching for performance optimization.
 *
 * @param router - Router instance to enhance
 * @returns Enhanced router with state management methods
 *
 * @internal This is a router enhancement function, not meant for direct use.
 */
export function withState<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
): Router<Dependencies> {
  // Auto-incrementing state ID for tracking navigation history
  let stateId = 0;
  // Cached frozen state - avoids structuredClone on every getState() call
  let frozenState: State | undefined = undefined;
  // Previous state before the last setState call
  let previousState: State | undefined = undefined;

  // Lazy accessor for route tree (set by withRoutes, which runs after withState)
  const getTree = (): RouteTree => getRouteTree(router);

  // Cache for urlParams to avoid repeated route tree traversal
  // Key: route name, Value: array of URL param names
  const urlParamsCache = new Map<string, string[]>();

  const getUrlParams = (name: string): string[] => {
    // Check cache first
    const cached = urlParamsCache.get(name);

    if (cached !== undefined) {
      return cached;
    }

    // Compute and cache
    const segments = getSegmentsByName(getTree(), name);

    if (!segments) {
      // Cache empty result for non-existent routes
      urlParamsCache.set(name, []);

      return [];
    }

    const result = segments.flatMap((segment) =>
      /* v8 ignore next -- @preserve segments always have parsers */
      segment.parser ? segment.parser.urlParams : [],
    );

    urlParamsCache.set(name, result);

    return result;
  };

  /**
   * Returns the current router state.
   *
   * The returned state is deeply frozen (immutable) for safety.
   * Returns `undefined` if the router has not been started or has been stopped.
   *
   * @template P - Type of route parameters
   * @template MP - Type of meta parameters (URL vs query param sources)
   * @returns Current frozen state or undefined
   *
   * @example
   * ```typescript
   * const state = router.getState();
   * if (state) {
   *   console.log(state.name, state.params);
   * }
   * ```
   */
  router.getState = <P extends Params = Params, MP extends Params = Params>():
    | State<P, MP>
    | undefined => {
    return frozenState as State<P, MP> | undefined;
  };

  /**
   * Sets the current router state.
   *
   * The state is deeply frozen before storage to ensure immutability.
   * The previous state is preserved and accessible via `getPreviousState()`.
   *
   * @param state - New state to set, or undefined to clear
   *
   * @remarks
   * This is primarily used internally by the navigation system.
   * Direct usage should be rare and careful.
   *
   * @example
   * ```typescript
   * // Used internally after successful navigation
   * router.setState(newState);
   *
   * // Clear state (e.g., on router.stop())
   * router.setState(undefined);
   * ```
   */
  router.setState = (state: State | undefined) => {
    // Validate state structure if provided
    if (state !== undefined) {
      validateState(state, "router.setState");
    }

    // Preserve current state as previous before updating
    previousState = frozenState;
    // If state is already frozen (from makeState()), use it directly.
    // For external states, freeze in place without cloning.
    // This allows Proxy states and avoids structuredClone overhead.
    if (!state) {
      frozenState = undefined;
    } else if (Object.isFrozen(state)) {
      // State is already frozen (typically from makeState)
      frozenState = state;
    } else {
      // External state - freeze in place without cloning.
      // Uses Object.freeze recursively, allowing Proxy objects and
      // preserving Symbol/function values in meta.options.
      frozenState = freezeStateInPlace(state);
    }
  };

  /**
   * Returns the previous router state (before the last navigation).
   *
   * Useful for implementing "back" functionality or transition animations.
   * The returned state is deeply frozen (immutable).
   *
   * @template P - Type of route parameters
   * @template MP - Type of meta parameters
   * @returns Previous frozen state or undefined if no previous navigation
   *
   * @example
   * ```typescript
   * router.navigate('users');
   * router.navigate('settings');
   *
   * const prev = router.getPreviousState();
   * console.log(prev?.name); // 'users'
   * ```
   */
  router.getPreviousState = <
    P extends Params = Params,
    MP extends Params = Params,
  >(): State<P, MP> | undefined => {
    return previousState as State<P, MP> | undefined;
  };

  /**
   * Creates a route state object.
   *
   * @template P - Type of route parameters. MUST include all properties from
   *   route.defaultParams for proper type safety.
   * @template MP - Type of meta parameters (URL params)
   *
   * @param name - Route name
   * @param params - Route parameters (merged with defaultParams)
   * @param path - URL path (auto-built if not provided)
   * @param meta - State metadata
   * @param forceId - Force specific state ID
   * @returns Route state object
   *
   * @remarks
   * **Type Contract:**
   * The `params` result includes properties from `route.defaultParams`.
   * For correct typing, ensure that `P` includes all defaultParams properties:
   *
   * @example
   * ```typescript
   * // Route definition
   * { name: "users", path: "/users", defaultParams: { page: 1, limit: 10 } }
   *
   * // Correct usage — P includes defaultParams properties
   * type UsersParams = { page: number; limit: number; filter?: string };
   * router.makeState<UsersParams>('users', { page: 2, limit: 20 });
   *
   * // Incorrect usage — P missing defaultParams properties
   * type BadParams = { filter: string };  // Missing page, limit!
   * router.makeState<BadParams>('users', { filter: 'active' });
   * // Runtime: state.params = { page: 1, limit: 10, filter: 'active' }
   * // TypeScript: state.params = { filter: 'active' } — type mismatch!
   * ```
   */
  router.makeState = <P extends Params = Params, MP extends Params = Params>(
    name: string,
    params?: P,
    path?: string,
    meta?: StateMetaInput<MP>,
    forceId?: number,
  ): State<P, MP> => {
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
          id: forceId ?? ++stateId,
          params: meta.params,
          options: meta.options,
          redirected: meta.redirected,
        }
      : undefined;

    // Optimization: avoid spreading when no defaultParams exist
    const routerDefaultParams = getConfig(router).defaultParams;
    const hasDefaultParams = Object.hasOwn(routerDefaultParams, name);
    // Contract: P MUST include all properties from defaultParams[name]
    // Note: always spread params when provided to handle Proxy objects correctly
    let mergedParams: P;

    if (hasDefaultParams) {
      mergedParams = { ...routerDefaultParams[name], ...params } as P;
    } else if (params) {
      mergedParams = { ...params };
    } else {
      mergedParams = {} as P;
    }

    const state: State<P, MP> = {
      name,
      params: mergedParams,
      path: path ?? router.buildPath(name, params),
      // write guard is meta
      meta: madeMeta,
    };

    // Freeze state immediately after creation for immutability guarantee.
    // This eliminates need for deepFreezeState in invokeEventListeners.
    return freezeStateInPlace(state);
  };

  /**
   * Creates a state for an unmatched (404) route.
   *
   * Used when no route matches the requested path.
   * The state name is set to `constants.UNKNOWN_ROUTE` ("@@router/UNKNOWN_ROUTE").
   *
   * @param path - The unmatched URL path
   * @param options - Optional navigation options (reload, replace, etc.)
   * @returns State object representing the unknown route
   *
   * @example
   * ```typescript
   * const notFound = router.makeNotFoundState('/non-existent-page');
   * // { name: '@@router/UNKNOWN_ROUTE', params: { path: '/non-existent-page' }, ... }
   * ```
   */
  router.makeNotFoundState = (
    path: string,
    options?: NavigationOptions,
  ): State => {
    // Validate path
    if (!isString(path)) {
      throw new TypeError(
        `[router.makeNotFoundState] Invalid path: ${getTypeDescription(path)}. Expected string.`,
      );
    }

    // Validate options if provided
    if (options !== undefined && !isNavigationOptions(options)) {
      throw new TypeError(
        `[router.makeNotFoundState] Invalid options: ${getTypeDescription(options)}. Expected NavigationOptions object.`,
      );
    }

    return router.makeState<{ path: string }>(
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
  };

  /**
   * Compares two states for equality.
   *
   * By default, only URL path parameters are compared (query params ignored).
   * This matches typical navigation behavior where query params don't trigger
   * route change events.
   *
   * **Precondition:** States must be valid State objects (created via makeState, buildState, etc.).
   * No runtime validation is performed for performance reasons.
   *
   * @param state1 - First state to compare
   * @param state2 - Second state to compare
   * @param ignoreQueryParams - If true (default), only compare URL path params
   * @returns True if states are considered equal
   *
   * @example
   * ```typescript
   * // Same route, different query params — considered equal by default
   * router.areStatesEqual(
   *   { name: 'users', params: { page: '1' } },
   *   { name: 'users', params: { page: '2' } }
   * ); // true (page is a query param)
   *
   * // Compare all params including query params
   * router.areStatesEqual(state1, state2, false);
   * ```
   */
  router.areStatesEqual = (
    state1: State | null | undefined,
    state2: State | null | undefined,
    ignoreQueryParams = true,
  ): boolean => {
    // Handle null/undefined cases: both falsy = equal, one falsy = not equal
    if (!state1 || !state2) {
      return !!state1 === !!state2;
    }

    // No runtime validation for performance — states are validated at creation time

    // Different route names = definitely not equal
    if (state1.name !== state2.name) {
      return false;
    }

    // When ignoring query params, only compare URL path parameters
    // Optimization: use meta.params if available (avoids tree traversal)
    // Note: meta.params is RouteTreeStateMeta, not route params
    if (ignoreQueryParams) {
      // Try to get URL params from state meta (O(segments × params) but no tree lookup)
      // State meta is available when state was created via buildStateWithSegments/makeState
      const stateMeta = (state1.meta?.params ?? state2.meta?.params) as
        | RouteTreeStateMeta
        | undefined;

      const urlParams = stateMeta
        ? getUrlParamsFromMeta(stateMeta)
        : getUrlParams(state1.name);

      return urlParams.every((param) =>
        areParamValuesEqual(state1.params[param], state2.params[param]),
      );
    }

    // Full comparison: check all params from both states
    // Must verify BOTH:
    // 1. Same keys in both objects (not just same length)
    // 2. Same values for each key (with deep equality for arrays)
    const state1Keys = Object.keys(state1.params);
    const state2Keys = Object.keys(state2.params);

    // Different number of keys = not equal
    if (state1Keys.length !== state2Keys.length) {
      return false;
    }

    // Check that state2 has all keys from state1 AND values are equal
    // This also implicitly checks state1 has all keys from state2
    // (since lengths are equal, if all state1 keys exist in state2, they must be the same set)
    return state1Keys.every(
      (param) =>
        param in state2.params &&
        areParamValuesEqual(state1.params[param], state2.params[param]),
    );
  };

  /**
   * Checks if childState is a descendant of parentState in the route hierarchy.
   *
   * @deprecated This method will be removed in the next major version.
   * Use `router.isActiveRoute()` instead for most use cases.
   *
   * @example
   * ```typescript
   * // Instead of:
   * router.areStatesDescendants(parentState, childState);
   *
   * // Use isActiveRoute to check against current state:
   * router.isActiveRoute(parentState.name, parentState.params);
   * ```
   *
   * @param parentState - Potential parent state
   * @param childState - Potential child state
   * @returns True if childState is a descendant of parentState
   */
  router.areStatesDescendants = (
    parentState: State,
    childState: State,
  ): boolean => {
    // Validate states
    validateState(parentState, "areStatesDescendants");
    validateState(childState, "areStatesDescendants");

    logger.warn(
      "real-router",
      "areStatesDescendants is deprecated and will be removed in the next major version. " +
        "Use router.isActiveRoute() instead.",
    );

    // Check if childState.name starts with "parentState.name."
    // Using startsWith instead of regex to avoid ReDoS and improve performance
    const parentPrefix = `${parentState.name}.`;

    if (!childState.name.startsWith(parentPrefix)) {
      return false;
    }

    // If child state name extends parent state name, and all parent state params
    // are in child state params (with deep equality for arrays).
    return Object.keys(parentState.params).every((p) =>
      areParamValuesEqual(parentState.params[p], childState.params[p]),
    );
  };

  /**
   * Resolves route forwarding and merges defaultParams.
   *
   * @template P - Type of route parameters. MUST include all properties from
   *   defaultParams of both source route and forwarded route.
   *
   * @param routeName - Original route name
   * @param routeParams - Route parameters
   * @returns Resolved route name and merged parameters
   *
   * @remarks
   * **Type Contract:**
   * When using forwardTo, defaultParams from BOTH routes are merged:
   * 1. defaultParams[originalRoute]
   * 2. defaultParams[forwardedRoute]
   * 3. provided routeParams
   *
   * Ensure P includes properties from all sources.
   *
   * @example
   * ```typescript
   * // Route definitions
   * { name: "old-users", path: "/old-users", forwardTo: "users" }
   * { name: "users", path: "/users", defaultParams: { page: 1 } }
   *
   * router.forwardState("old-users", { filter: "active" });
   * // Returns: { name: "users", params: { page: 1, filter: "active" } }
   * ```
   */
  router.forwardState = <P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ): SimpleState<P> => {
    // Validate routeName is a string
    if (!isString(routeName)) {
      throw new TypeError(
        `[router.forwardState] Invalid routeName: ${getTypeDescription(routeName)}. Expected string.`,
      );
    }

    // Validate params
    if (!isParams(routeParams)) {
      throw new TypeError(
        `[router.forwardState] Invalid routeParams: ${getTypeDescription(routeParams)}. Expected plain object.`,
      );
    }

    // Use cached resolved forwardTo chain (O(1) lookup)
    // TODO(RFC-8): Replace with CacheManager.getInstance().getForwardTarget(router, routeName)
    const resolvedMap = getResolvedForwardMap(router);
    const name = resolvedMap[routeName] ?? routeName;
    const { defaultParams } = getConfig(router);

    // Contract: P MUST include all properties from defaultParams of both routes
    // Optimization: avoid spreading when no defaultParams exist
    const hasRouteDefaults = Object.hasOwn(defaultParams, routeName);
    const hasNameDefaults = Object.hasOwn(defaultParams, name);

    // Type assertion needed: merged params satisfy P contract per JSDoc
    let params: P;

    if (hasRouteDefaults && hasNameDefaults) {
      // Both routes have defaults - need all three spreads
      params = {
        ...defaultParams[routeName],
        ...defaultParams[name],
        ...routeParams,
      } as P;
    } else if (hasRouteDefaults) {
      // Only source route has defaults
      params = { ...defaultParams[routeName], ...routeParams } as P;
    } else if (hasNameDefaults) {
      // Only target route has defaults
      params = { ...defaultParams[name], ...routeParams } as P;
    } else {
      // No defaults - use routeParams directly
      params = routeParams;
    }

    return {
      name,
      params,
    };
  };

  /**
   * Builds a route tree state from route name and parameters.
   *
   * Resolves forwarding, applies defaultParams, and creates a state
   * with segment metadata. Returns undefined if the route doesn't exist.
   *
   * @template P - Type of route parameters
   * @param routeName - Route name (may be forwarded to another route)
   * @param routeParams - Route parameters
   * @returns Route tree state with segment info, or undefined if route not found
   *
   * @example
   * ```typescript
   * const state = router.buildState('users.view', { id: '123' });
   * if (state) {
   *   console.log(state.name, state.params, state.meta);
   * }
   * ```
   */
  router.buildState = <P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ): RouteTreeState<P> | undefined => {
    // Validate routeName is a string
    if (!isString(routeName)) {
      throw new TypeError(
        `[router.buildState] Invalid routeName: ${getTypeDescription(routeName)}. Expected string.`,
      );
    }

    // Validate params
    if (!isParams(routeParams)) {
      throw new TypeError(
        `[router.buildState] Invalid routeParams: ${getTypeDescription(routeParams)}. Expected plain object.`,
      );
    }

    // Resolve forwarding and merge defaultParams
    const { name, params } = router.forwardState(routeName, routeParams);

    // Get route segments from the tree
    const segments = getSegmentsByName(getTree(), name);

    if (!segments) {
      return undefined;
    }

    // Build state with segment metadata (URL vs query param sources)
    return createRouteState({ segments, params }, name);
  };

  /**
   * Builds state with segments for internal use.
   * Avoids duplicate getSegmentsByName call when path building is needed.
   *
   * @internal
   */
  router.buildStateWithSegments = <P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ): BuildStateResultWithSegments<P> | undefined => {
    // Validate routeName is a string
    if (!isString(routeName)) {
      throw new TypeError(
        `[router.buildStateWithSegments] Invalid routeName: ${getTypeDescription(routeName)}. Expected string.`,
      );
    }

    // Validate params
    if (!isParams(routeParams)) {
      throw new TypeError(
        `[router.buildStateWithSegments] Invalid routeParams: ${getTypeDescription(routeParams)}. Expected plain object.`,
      );
    }

    // Resolve forwarding and merge defaultParams
    const { name, params } = router.forwardState(routeName, routeParams);

    // Get route segments from the tree
    const segments = getSegmentsByName(getTree(), name);

    if (!segments) {
      return undefined;
    }

    // Build state with segment metadata (URL vs query param sources)
    const state = createRouteState<P>({ segments, params }, name);

    return { state, segments };
  };

  return router;
}
