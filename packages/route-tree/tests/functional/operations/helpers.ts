/**
 * Test helpers for operations tests.
 */

import { MatcherService } from "../../../src/services/MatcherService";

import type {
  MatchOptions,
  MatchResult,
  RouteTree,
  RouteTreeState,
  RouteTreeStateMeta,
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
 * Builds metadata from route segments.
 * Maps segment names to their parameter type maps.
 */
function getMetaFromSegments(
  segments: readonly RouteTree[],
): RouteTreeStateMeta {
  const meta: RouteTreeStateMeta = {};

  for (const segment of segments) {
    if (segment.name) {
      meta[segment.fullName] = segment.paramTypeMap;
    }
  }

  return meta;
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

  let name = "";

  for (const segment of result.segments) {
    if (segment.name) {
      if (name) {
        name += ".";
      }

      name += segment.name;
    }
  }

  let cachedMeta: RouteTreeStateMeta | null = null;

  return {
    name,
    params: result.params,
    get meta(): RouteTreeStateMeta {
      cachedMeta ??= getMetaFromSegments(result.segments);

      return cachedMeta;
    },
  };
}
