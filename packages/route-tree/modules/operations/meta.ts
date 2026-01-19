// packages/route-node/modules/operations/meta.ts

/**
 * Metadata Operations.
 *
 * Pure functions for building route parameter metadata.
 *
 * @module operations/meta
 */

import type {
  ParamTypeMap,
  PathParser,
  RouteTree,
  RouteTreeStateMeta,
} from "../types";

// =============================================================================
// Public API
// =============================================================================

/**
 * Builds a map of parameter names to their source type (url or query).
 *
 * @param parser - Path parser to extract parameters from
 * @returns Map of parameter names to their source type
 */
export function buildParamTypeMap(parser: PathParser | null): ParamTypeMap {
  const params: ParamTypeMap = {};

  if (!parser) {
    return params;
  }

  for (const p of parser.urlParams) {
    params[p] = "url";
  }

  for (const p of parser.queryParams) {
    params[p] = "query";
  }

  return params;
}

/**
 * Builds parameter type metadata from route segments.
 *
 * @param segments - Array of route tree segments
 * @returns Metadata mapping segment names to their parameter types
 *
 * @example
 * ```typescript
 * const meta = getMetaFromSegments(matchResult.segments);
 * // → { users: {}, "users.profile": { id: "url" } }
 * ```
 */
export function getMetaFromSegments(
  segments: readonly RouteTree[],
): RouteTreeStateMeta {
  const meta: RouteTreeStateMeta = {};

  for (const segment of segments) {
    // Use pre-computed fullName and paramTypeMap from RouteTree cache
    // This avoids string concatenation and buildParamTypeMap() call per segment
    meta[segment.fullName] = segment.paramTypeMap;
  }

  return meta;
}
