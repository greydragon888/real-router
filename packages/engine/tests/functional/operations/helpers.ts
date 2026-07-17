/**
 * Test helpers for operations tests.
 */

import { createMatcher } from "engine";

import type {
  CreateMatcherOptions,
  MatchResult,
  RouteTree,
  RouteTreeState,
} from "engine";

// Test-only per-call matching options. The matcher-honoured subset is
// strictTrailingSlash / queryParamsMode / urlParamsEncoding / queryParams;
// strongMatching / trailingSlashMode are accepted for these legacy per-call
// tests but have NEVER been implemented (they are ignored — the phantom option
// types were dropped from the public API in #1302).
interface MatchOptions {
  strictTrailingSlash?: boolean;
  queryParamsMode?: "default" | "strict" | "loose";
  urlParamsEncoding?: CreateMatcherOptions["urlParamsEncoding"];
  queryParams?: CreateMatcherOptions["queryParams"];
  strongMatching?: boolean;
  trailingSlashMode?: "default" | "never" | "always";
}

/**
 * Maps per-call MatchOptions to CreateMatcherOptions for per-call matcher creation.
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
    params: result.params,
    meta: result.meta,
  };
}
