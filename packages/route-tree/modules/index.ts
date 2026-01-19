// packages/route-tree/modules/index.ts

/**
 * Route Tree - Public API
 *
 * Minimal functional API for working with route trees.
 * All functions are immutable and side-effect free.
 *
 * @module route-tree
 */

// =============================================================================
// Builder
// =============================================================================

export { createRouteTree } from "./builder/createRouteTree";

// =============================================================================
// Operations
// =============================================================================

export { matchSegments } from "./operations/match";

export { buildPath } from "./operations/build";

export { getSegmentsByName, hasSegmentsByName } from "./operations/query";

export { getMetaFromSegments } from "./operations/meta";

export {
  routeTreeToDefinitions,
  nodeToDefinition,
} from "./operations/routeTreeToDefinitions";

// =============================================================================
// Validation
// =============================================================================

export { validateRoute } from "./validation/route-batch";

// =============================================================================
// Types
// =============================================================================

export type {
  BuildOptions,
  MatchOptions,
  MatchResult,
  RouteDefinition,
  RouteParams,
  RouteTree,
  RouteTreeState,
  RouteTreeStateMeta,
  TrailingSlashMode,
} from "./types";
