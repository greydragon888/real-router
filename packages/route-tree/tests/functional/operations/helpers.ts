/**
 * Test helpers for operations tests.
 */

import { matchSegments } from "../../../src/operations/match";
import { getMetaFromSegments } from "../../../src/operations/meta";

import type {
  MatchOptions,
  RouteTree,
  RouteTreeState,
  RouteTreeStateMeta,
} from "../../../src/types";

/**
 * Test helper - builds state from matchSegments result.
 * This replicates the deleted matchPath function for test purposes.
 */
export function matchPath(
  tree: RouteTree,
  path: string,
  options: MatchOptions = {},
): RouteTreeState | null {
  const result = matchSegments(tree, path, options);

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

// Re-export commonly used functions

export {
  getMetaFromSegments,
  buildParamTypeMap,
} from "../../../src/operations/meta";

export { matchSegments } from "../../../src/operations/match";
