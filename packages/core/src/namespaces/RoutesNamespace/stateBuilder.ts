// packages/real-router/modules/core/stateBuilder.ts

/**
 * State Builder Utilities.
 *
 * Functions for building RouteTreeState from raw route segments.
 * This module handles the conversion from low-level route-node data
 * to the higher-level state representation used by real-router.
 *
 * @module core/stateBuilder
 */

import type {
  MatchResult,
  RouteParams,
  RouteTree,
  RouteTreeState,
  RouteTreeStateMeta,
} from "route-tree";

/**
 * Builds a dot-separated route name from segments.
 *
 * @param segments - Array of route segments with names
 * @returns Dot-separated route name (e.g., "users.profile")
 *
 * @example
 * ```typescript
 * const segments = [{ name: "users" }, { name: "profile" }];
 * buildNameFromSegments(segments); // "users.profile"
 * ```
 */
export function buildNameFromSegments(segments: readonly RouteTree[]): string {
  let name = "";

  for (const segment of segments) {
    if (segment.name) {
      if (name) {
        name += ".";
      }

      name += segment.name;
    }
  }

  return name;
}

/**
 * Creates a RouteTreeState from a MatchResult.
 *
 * This function is the primary way to build a RouteTreeState when
 * you have a MatchResult from matchPathSegments() or other low-level APIs.
 *
 * @param matchResult - Result from matchPathSegments() containing segments and params
 * @param name - Optional explicit name (if not provided, built from segments)
 * @returns RouteTreeState with name, params, and meta
 *
 * @example
 * ```typescript
 * const matchResult = routeNode.matchPathSegments("/users/123");
 * if (matchResult) {
 *   const state = createRouteState(matchResult);
 *   // { name: "users.profile", params: { id: "123" }, meta: {...} }
 * }
 * ```
 */
export function createRouteState<P extends RouteParams = RouteParams>(
  matchResult: MatchResult<P>,
  name?: string,
): RouteTreeState<P> {
  const resolvedName = name ?? buildNameFromSegments(matchResult.segments);

  const meta: RouteTreeStateMeta = {};

  for (const segment of matchResult.segments) {
    meta[segment.fullName] = segment.paramTypeMap;
  }

  return {
    name: resolvedName,
    params: matchResult.params,
    meta,
  };
}
