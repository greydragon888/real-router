// packages/real-router/modules/core/routes/routePath.ts

import {
  createRouteTree,
  matchSegments,
  buildPath as routeNodeBuildPath,
} from "route-tree";
import { isString } from "type-guards";

import { constants } from "@real-router/core";

import { ROUTE_DEFINITIONS_SYMBOL, ROOT_PATH_SYMBOL } from "../../constants";
import { createBuildOptions } from "../../helpers";
import { getConfig, getRouteTree, setRouteTree } from "../../internals";
import { createRouteState } from "../stateBuilder";

import type {
  Params,
  State,
  Router,
  DefaultDependencies,
  Options,
} from "core-types";
import type {
  BuildOptions,
  MatchOptions,
  RouteDefinition,
  RouteTree,
} from "route-tree";

// =============================================================================
// BuildOptions Cache (local to routePath)
// =============================================================================

/**
 * Internal Symbol for caching buildOptions.
 * Local to this module — only used by buildPath functionality.
 *
 * @internal
 * @todo RFC-1: Replace with direct #options field access from internal contour.
 */
const BUILD_OPTIONS_CACHE_SYMBOL = Symbol("real-router.buildOptionsCache");

/**
 * Type for router with cached buildOptions.
 */
type RouterWithCache = Record<symbol, BuildOptions | undefined>;

/**
 * Initializes buildOptions cache for a router.
 * Called from routerLifecycle.ts at router.start().
 *
 * @param router - Router instance
 * @param options - Router options
 *
 * @internal
 */
export function initBuildOptionsCache<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
  options: Options,
): void {
  // Invalidate previous cache (support for stop/start cycles)
  delete (router as RouterWithCache)[BUILD_OPTIONS_CACHE_SYMBOL];
  // Create new cache with current options
  (router as RouterWithCache)[BUILD_OPTIONS_CACHE_SYMBOL] =
    createBuildOptions(options);
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_ROUTE_NAME = "";

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
 * Adds path building and matching capabilities to a router instance.
 * Handles URL path construction, path-to-route matching, and root path management.
 *
 * @returns Function to enhance router with path capabilities
 */
export function withRoutePath<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
): Router<Dependencies> {
  /**
   * Builds a URL path for a route with parameters.
   *
   * @param route - Route name (dot-notation for nested routes, e.g., 'users.profile')
   * @param params - Route parameters to encode into the path
   * @returns Built URL path
   * @throws {TypeError} If route is not a non-empty string
   * @throws {Error} If route does not exist in the router
   * @throws {Error} If required parameters are missing
   * @throws {Error} If parameter value doesn't match its constraint pattern
   *
   * @remarks
   * **Parameter Type Coercion:**
   * - Numeric values (including `NaN`, `Infinity`, `-Infinity`) are converted to strings
   *   via `String()`. This may produce unexpected URLs like `/user/NaN` or `/user/Infinity`.
   *   Validate numeric parameters before passing them to buildPath if semantic correctness
   *   is required.
   * - Boolean values are converted to `"true"` or `"false"` strings.
   * - Empty strings throw an error as they don't match the default parameter pattern.
   * - Arrays are converted via `String()` (e.g., `["a","b"]` → `"a,b"`), which may fail
   *   validation unless a custom constraint like `<.*>` is used.
   *
   * @example
   * // Basic usage
   * router.buildPath('users.view', { id: '123' });
   * // Returns: '/users/123'
   *
   * @example
   * // With query parameters
   * router.buildPath('search', { q: 'hello', page: '1' });
   * // Returns: '/search?q=hello&page=1'
   *
   * @example
   * // Numeric values are stringified (use with caution)
   * router.buildPath('user', { id: 42 });      // → '/user/42'
   * router.buildPath('user', { id: NaN });     // → '/user/NaN' ⚠️
   * router.buildPath('user', { id: Infinity }); // → '/user/Infinity' ⚠️
   */
  router.buildPath = (route: string, params?: Params): string => {
    // Early validation for better DX (fail-fast with clear message)
    if (!isString(route) || route === "") {
      throw new TypeError(
        `[real-router] buildPath: route must be a non-empty string, got ${typeof route === "string" ? '""' : typeof route}`,
      );
    }

    if (route === constants.UNKNOWN_ROUTE) {
      return isString(params?.path) ? params.path : "";
    }

    const config = getConfig(router);

    // R2 optimization: avoid spread when no defaultParams
    const paramsWithDefault = Object.hasOwn(config.defaultParams, route)
      ? { ...config.defaultParams[route], ...params }
      : (params ?? {});

    // Apply custom encoder if defined (copy protects original params)
    const encodedParams =
      typeof config.encoders[route] === "function"
        ? config.encoders[route]({ ...paramsWithDefault })
        : paramsWithDefault;

    // R5 optimization: read cached buildOptions (created at router.start())
    // Fallback for cold calls before start() — creates buildOptions on the fly
    const buildOptions =
      (router as RouterWithCache)[BUILD_OPTIONS_CACHE_SYMBOL] ??
      createBuildOptions(router.getOptions());

    return routeNodeBuildPath(
      getRouteTree(router),
      route,
      encodedParams,
      buildOptions,
    );
  };

  /**
   * Internal path builder that accepts pre-computed segments.
   * Avoids duplicate getSegmentsByName call when segments are already available.
   *
   * @internal
   */
  router.buildPathWithSegments = (
    route: string,
    params: Params,
    segments: readonly unknown[],
  ): string => {
    // Early validation for better DX (fail-fast with clear message)
    if (!isString(route) || route === "") {
      throw new TypeError(
        `[real-router] buildPathWithSegments: route must be a non-empty string, got ${typeof route === "string" ? '""' : typeof route}`,
      );
    }

    if (route === constants.UNKNOWN_ROUTE) {
      return isString(params.path) ? params.path : "";
    }

    const config = getConfig(router);

    // R2 optimization: avoid spread when no defaultParams
    const paramsWithDefault = Object.hasOwn(config.defaultParams, route)
      ? { ...config.defaultParams[route], ...params }
      : params;

    // Apply custom encoder if defined (copy protects original params)
    const encodedParams =
      typeof config.encoders[route] === "function"
        ? config.encoders[route]({ ...paramsWithDefault })
        : paramsWithDefault;

    // R5 optimization: read cached buildOptions
    /* v8 ignore next 2 -- @preserve defensive: always called after router.start() */
    const buildOptions =
      (router as RouterWithCache)[BUILD_OPTIONS_CACHE_SYMBOL] ??
      createBuildOptions(router.getOptions());

    // Pass segments to avoid duplicate getSegmentsByName call in route-tree
    // Cast to RouteTree[] - segments come from getSegmentsByName which returns RouteTree[]
    return routeNodeBuildPath(
      getRouteTree(router),
      route,
      encodedParams,
      buildOptions,
      segments as readonly RouteTree[],
    );
  };

  /**
   * Matches a URL path to a route in the tree.
   * Uses caching for performance optimization.
   * Note: RouteNode automatically matches `/` child nodes when accessing parent.
   *
   * @param path - URL path to match
   * @param source - Optional source identifier for debugging
   * @returns Matched state or undefined if no match
   *
   * @example
   * const state = router.matchPath('/users/123');
   * // Returns: { name: 'users.view', params: { id: '123' }, ... }
   */
  router.matchPath = <P extends Params = Params, MP extends Params = Params>(
    path: string,
    source?: string,
  ): State<P, MP> | undefined => {
    // Early validation for better DX (fail-fast with clear message)
    if (!isString(path)) {
      throw new TypeError(
        `[real-router] matchPath: path must be a string, got ${typeof path}`,
      );
    }

    const options = router.getOptions();

    // Use full set of options supported by RouteNode
    const matchOptions = createMatchOptions(options);

    // Use low-level API: get segments and build state in real-router
    const matchResult = matchSegments(getRouteTree(router), path, matchOptions);

    if (matchResult) {
      // Build RouteTreeState from MatchResult
      const routeState = createRouteState(matchResult);
      const { name, params, meta } = routeState;

      const { decoders } = getConfig(router);
      const decodedParams =
        typeof decoders[name] === "function"
          ? decoders[name](params as Params)
          : params;
      const { name: routeName, params: routeParams } = router.forwardState<P>(
        name,
        decodedParams as P,
      );
      const builtPath = options.rewritePathOnMatch
        ? router.buildPath(routeName, routeParams)
        : path;

      // makeState() already returns frozen state - no need for redundant freeze
      return router.makeState<P, MP>(routeName, routeParams, builtPath, {
        params: meta as MP,
        options: {},
        source,
        redirected: false,
      });
    }

    return undefined;
  };

  /**
   * Sets the root path for the router.
   *
   * @param newRootPath - New root path
   */
  router.setRootPath = (newRootPath): void => {
    type RouterInternal = Record<symbol, RouteDefinition[] | string>;
    const routerInternal = router as RouterInternal;

    routerInternal[ROOT_PATH_SYMBOL] = newRootPath;

    // Rebuild tree with new root path
    const routeDefinitions = routerInternal[
      ROUTE_DEFINITIONS_SYMBOL
    ] as RouteDefinition[];

    setRouteTree(
      router,
      createRouteTree(DEFAULT_ROUTE_NAME, newRootPath, routeDefinitions, {
        skipValidation: true,
      }),
    );
  };

  router.getRootPath = (): string => {
    return (router as Record<symbol, string>)[ROOT_PATH_SYMBOL] || "";
  };

  return router;
}
