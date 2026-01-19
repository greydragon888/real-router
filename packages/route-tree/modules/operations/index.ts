// packages/route-tree/modules/operations/index.ts

/**
 * Route Operations.
 *
 * Pure functions for route tree operations:
 * - match: Path matching
 * - build: Path building
 * - query: Route lookups
 * - meta: Metadata building
 *
 * @module operations
 */

export { matchSegments } from "./match";

export { buildPath } from "./build";

export { getSegmentsByName, hasSegmentsByName } from "./query";

export { getMetaFromSegments } from "./meta";

export {
  routeTreeToDefinitions,
  nodeToDefinition,
} from "./routeTreeToDefinitions";

export type {
  QueryParamsMode,
  TrailingSlashMode,
  URLParamsEncodingType,
  BasePathOptions,
  BuildOptions,
  MatchOptions,
  ParamSource,
  ParamTypeMap,
  RouteTreeStateMeta,
  RouteParams,
  MatchResult,
  RouteTreeState,
  // Re-exported from builder/types
  PathBuildOptions,
  PathTestOptions,
  PathParser,
} from "./types";
