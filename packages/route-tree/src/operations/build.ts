// packages/route-node/modules/operations/build.ts

/**
 * Path Building Operations.
 *
 * Pure functions for building URL paths from route names and parameters.
 *
 * @module operations/build
 */

import { build as buildQueryString } from "search-params";

import { getSegmentsByName } from "./query";
import { RouteNotFoundError } from "../validation/errors";

import type {
  BuildOptions,
  RouteParams,
  RouteTree,
  TrailingSlashMode,
} from "../types";

// =============================================================================
// Constants
// =============================================================================

/**
 * Shared empty array for lazy allocation optimization.
 * Avoids creating new empty arrays for routes without params.
 */
const EMPTY_ARRAY: readonly string[] = Object.freeze([]);

// =============================================================================
// Helpers
// =============================================================================

/**
 * Checks if object has any own enumerable keys.
 * More efficient than Object.keys().length > 0 (avoids array allocation).
 */
function hasOwnKeys(obj: object): boolean {
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if BuildOptions contains any non-default values.
 * Used to determine if fast path can be taken.
 *
 * Default values that allow fast path:
 * - trailingSlashMode: "default" or undefined
 * - queryParamsMode: "default" or undefined
 * - queryParams: undefined
 * - urlParamsEncoding: "default" or undefined
 */
function hasNonDefaultOptions(options: BuildOptions): boolean {
  return (
    (options.trailingSlashMode !== undefined &&
      options.trailingSlashMode !== "default") ||
    (options.queryParamsMode !== undefined &&
      options.queryParamsMode !== "default") ||
    options.queryParams !== undefined ||
    (options.urlParamsEncoding !== undefined &&
      options.urlParamsEncoding !== "default")
  );
}

// =============================================================================
// Types
// =============================================================================

/**
 * Collected parameters from route segments.
 */
interface CollectedParams {
  readonly searchParams: readonly string[];
  readonly nonSearchParams: readonly string[];
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Tries fast path for simple route names without parameters.
 * Returns staticPath if available, null otherwise.
 */
function tryStaticPathFast(tree: RouteTree, routeName: string): string | null {
  if (routeName.includes(".")) {
    const segments = getSegmentsByName(tree, routeName);
    const staticPath = segments?.at(-1)?.staticPath;

    return staticPath ?? null;
  }

  return tree.childrenByName.get(routeName)?.staticPath ?? null;
}

/**
 * Builds a URL path for the given route name and parameters.
 *
 * @param tree - Route tree to use
 * @param routeName - Dot-notation route name (e.g., "users.profile")
 * @param params - Route parameters
 * @param options - Build options
 * @param segments - Optional pre-computed segments (avoids getSegmentsByName call)
 * @returns Built URL path
 * @throws {RouteNotFoundError} If route not found
 *
 * @example
 * ```typescript
 * const url = buildPath(tree, "users.profile", { id: "123" });
 * // → "/users/123"
 *
 * // With pre-computed segments (avoids duplicate lookup)
 * const segments = getSegmentsByName(tree, "users.profile");
 * const url = buildPath(tree, "users.profile", { id: "123" }, {}, segments);
 * ```
 */
export function buildPath(
  tree: RouteTree,
  routeName: string,
  params: RouteParams = {},
  options: BuildOptions = {},
  segments?: readonly RouteTree[],
): string {
  // If segments provided, skip lookup and fast path (caller already has segments)
  if (segments) {
    return buildPathFromSegments(segments, params, options);
  }

  // Fast path: no params, default options - try pre-computed staticPath
  // R6 optimization: use hasOwnKeys instead of Object.keys().length (avoids array allocation)
  // R7 optimization: check option VALUES not just keys (enables fast path for real-router)
  const hasParams = hasOwnKeys(params);
  const hasNonDefaults = hasNonDefaultOptions(options);

  if (!hasParams && !hasNonDefaults) {
    const staticPath = tryStaticPathFast(tree, routeName);

    if (staticPath !== null) {
      return staticPath;
    }
  }

  // Regular path: find segments and build
  const foundSegments = getSegmentsByName(tree, routeName);

  if (!foundSegments) {
    throw new RouteNotFoundError(
      `[route-node][buildPath] '${routeName}' is not defined`,
      routeName,
    );
  }

  return buildPathFromSegments(foundSegments, params, options);
}

// =============================================================================
// Internal: Path Building
// =============================================================================

/**
 * Builds a URL path from route segments.
 *
 * Note: All segments from getSegmentsByName have parsers -
 * root is only included if it has a parser, and children always have parsers.
 */
function buildPathFromSegments(
  segments: readonly RouteTree[],
  params: RouteParams,
  options: BuildOptions,
): string {
  const { queryParamsMode = "default", trailingSlashMode = "default" } =
    options;

  const collected = collectParamsFromSegments(segments);
  const searchParams = resolveSearchParams(collected, params, queryParamsMode);
  const searchPart = buildSearchString(searchParams, params, options);
  const pathString = buildPathString(segments, params, options);
  const finalPath = applyTrailingSlashMode(pathString, trailingSlashMode);

  return finalPath + (searchPart ? `?${searchPart}` : "");
}

/**
 * Collects search and non-search parameters from segments.
 * Uses lazy allocation - arrays only created when params exist.
 */
function collectParamsFromSegments(
  segments: readonly RouteTree[],
): CollectedParams {
  let searchParams: string[] | null = null;
  let nonSearchParams: string[] | null = null;

  for (const segment of segments) {
    // All segments from getSegmentsByName have parsers by design
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const parser = segment.parser!;

    // Use for-loop instead of spread (1.49x faster)
    /* eslint-disable @typescript-eslint/prefer-for-of */
    if (parser.queryParams.length > 0) {
      searchParams ??= [];

      for (let i = 0; i < parser.queryParams.length; i++) {
        searchParams.push(parser.queryParams[i]);
      }
    }

    if (parser.urlParams.length > 0 || parser.spatParams.length > 0) {
      nonSearchParams ??= [];

      for (let i = 0; i < parser.urlParams.length; i++) {
        nonSearchParams.push(parser.urlParams[i]);
      }

      for (let i = 0; i < parser.spatParams.length; i++) {
        nonSearchParams.push(parser.spatParams[i]);
      }
    }
    /* eslint-enable @typescript-eslint/prefer-for-of */
  }

  return {
    searchParams: searchParams ?? EMPTY_ARRAY,
    nonSearchParams: nonSearchParams ?? EMPTY_ARRAY,
  };
}

/**
 * Resolves final search params, adding loose params if needed.
 */
function resolveSearchParams(
  collected: CollectedParams,
  params: RouteParams,
  queryParamsMode: BuildOptions["queryParamsMode"],
): readonly string[] {
  if (queryParamsMode !== "loose") {
    return collected.searchParams;
  }

  // Use slice() instead of spread (1.15x faster)
  const searchParams = [...(collected.searchParams as string[])];
  const searchParamsSet = new Set(collected.searchParams);
  const nonSearchParamsSet = new Set(collected.nonSearchParams);

  // Object.hasOwn filters inherited properties (prototype pollution protection)
  for (const p in params) {
    if (
      Object.hasOwn(params, p) &&
      !searchParamsSet.has(p) &&
      !nonSearchParamsSet.has(p)
    ) {
      searchParams.push(p);
    }
  }

  return searchParams;
}

/**
 * Builds the query string from search params.
 */
function buildSearchString(
  searchParams: readonly string[],
  params: RouteParams,
  options: BuildOptions,
): string {
  const searchParamsObject: RouteParams = {};

  for (const paramName of searchParams) {
    if (paramName in params) {
      searchParamsObject[paramName] = params[paramName];
    }
  }

  return buildQueryString(searchParamsObject, options.queryParams);
}

/**
 * Builds the path string from segments.
 */
function buildPathString(
  segments: readonly RouteTree[],
  params: RouteParams,
  options: BuildOptions,
): string {
  // Direct assignment eliminates conditional mutants
  // Parser handles undefined values the same as missing keys
  const buildOptions: Record<string, unknown> = {
    ignoreSearch: true,
    queryParams: options.queryParams,
    urlParamsEncoding: options.urlParamsEncoding,
  };

  let path = "";

  for (const segment of segments) {
    // All segments from getSegmentsByName have parsers by design
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const segmentPath = segment.parser!.build(params, buildOptions);

    path = segment.absolute ? segmentPath : path + segmentPath;
  }

  // Always normalize - regex only matches actual "//" sequences
  // Removed conditional check as it created equivalent mutants
  return path.replaceAll(/\/{2,}/g, "/");
}

/**
 * Applies trailing slash mode to the path.
 */
function applyTrailingSlashMode(path: string, mode: TrailingSlashMode): string {
  if (mode === "always") {
    return path.endsWith("/") ? path : `${path}/`;
  }

  if (mode === "never" && path !== "/") {
    return path.endsWith("/") ? path.slice(0, -1) : path;
  }

  return path;
}
