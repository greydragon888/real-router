/**
 * Test helpers for operations tests.
 */

import { MatcherService } from "../../../src/services/MatcherService";

import type {
  MatchOptions,
  MatchResult,
  RouteTree,
  RouteTreeState,
} from "../../../src/types";

/**
 * Wrapper for MatcherService.match() that returns null instead of undefined.
 * Provides backward compatibility with legacy matchSegments() behavior.
 */
export function matchSegments(
  tree: RouteTree,
  path: string,
  options?: MatchOptions,
): MatchResult | null {
  const matcher = new MatcherService();

  matcher.registerTree(tree);

  return matcher.match(path, options) ?? null;
}

/**
 * Test helper - builds state from MatcherService result.
 * This replicates the deleted matchPath function for test purposes.
 */
export function matchPath(
  tree: RouteTree,
  path: string,
  options: MatchOptions = {},
): RouteTreeState | null {
  const matcher = new MatcherService();

  matcher.registerTree(tree);
  const result = matcher.match(path, options);

  if (!result) {
    return null;
  }

  const name = result.segments.at(-1)?.fullName ?? "";

  return {
    name,
    params: result.params,
    meta: result.meta,
  };
}
