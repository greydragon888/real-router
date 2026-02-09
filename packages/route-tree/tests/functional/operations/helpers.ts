/**
 * Test helpers for operations tests.
 */

import { createMatcher } from "../../../src/createMatcher";

import type { CreateMatcherOptions } from "../../../src/createMatcher";
import type {
  MatchOptions,
  MatchResult,
  RouteParams,
  RouteTree,
  RouteTreeState,
} from "../../../src/types";

/**
 * Maps legacy MatchOptions to CreateMatcherOptions for per-call matcher creation.
 */
function toMatcherOptions(options?: MatchOptions): CreateMatcherOptions {
  if (!options) {
    return {};
  }

  const result: CreateMatcherOptions = {};

  if (options.strictTrailingSlash !== undefined) {
    (result as { strictTrailingSlash: boolean }).strictTrailingSlash =
      options.strictTrailingSlash;
  }

  if (options.queryParamsMode === "strict") {
    (result as { strictQueryParams: boolean }).strictQueryParams = true;
  }

  if (options.urlParamsEncoding !== undefined) {
    (result as { urlParamsEncoding: string }).urlParamsEncoding =
      options.urlParamsEncoding;
  }

  if (options.queryParams !== undefined) {
    (result as { queryParams: typeof options.queryParams }).queryParams =
      options.queryParams;
  }

  return result;
}

/**
 * Wrapper for createMatcher().match() that returns null instead of undefined.
 * Provides backward compatibility with legacy matchSegments() behavior.
 */
export function matchSegments(
  tree: RouteTree,
  path: string,
  options?: MatchOptions,
): MatchResult | null {
  const matcher = createMatcher(toMatcherOptions(options));

  matcher.registerTree(tree);

  return (matcher.match(path) as MatchResult | undefined) ?? null;
}

/**
 * Test helper - builds state from matcher result.
 * This replicates the deleted matchPath function for test purposes.
 */
export function matchPath(
  tree: RouteTree,
  path: string,
  options: MatchOptions = {},
): RouteTreeState | null {
  const matcher = createMatcher(toMatcherOptions(options));

  matcher.registerTree(tree);
  const result = matcher.match(path);

  if (!result) {
    return null;
  }

  const name = result.segments.at(-1)?.fullName ?? "";

  return {
    name,
    params: result.params as RouteParams,
    meta: result.meta,
  };
}
