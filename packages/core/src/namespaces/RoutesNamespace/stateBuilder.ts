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

import type { RouteParams, RouteTreeState } from "route-tree";

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
export function buildNameFromSegments(
  segments: readonly { fullName: string }[],
): string {
  return segments.at(-1)?.fullName ?? "";
}

/**
 * Creates a RouteTreeState from a match result.
 *
 * This function is the primary way to build a RouteTreeState when
 * you have a result from matcher.match().
 *
 * @param matchResult - Result from matcher.match() containing segments and params
 * @param matchResult.segments - Matched route segments
 * @param matchResult.params - Matched route params
 * @param matchResult.meta - Matched route meta
 * @param name - Optional explicit name (if not provided, built from segments)
 * @returns RouteTreeState with name, params, and meta
 *
 * @example
 * ```typescript
 * const matchResult = matcher.match("/users/123");
 * if (matchResult) {
 *   const state = createRouteState(matchResult);
 *   // { name: "users.profile", params: { id: "123" }, meta: {...} }
 * }
 * ```
 */
export function createRouteState<P extends RouteParams = RouteParams>(
  matchResult: {
    readonly segments: readonly { fullName: string }[];
    readonly params: Readonly<Record<string, unknown>>;
    readonly meta: Readonly<Record<string, Record<string, "url" | "query">>>;
  },
  name?: string,
): RouteTreeState<P> {
  const resolvedName = name ?? buildNameFromSegments(matchResult.segments);

  return {
    name: resolvedName,
    params: matchResult.params as P,
    meta: matchResult.meta as Record<string, Record<string, "url" | "query">>,
  };
}
