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

export { buildPath } from "./operations/build";

export { getSegmentsByName } from "./operations/query";

export {
  routeTreeToDefinitions,
  nodeToDefinition,
} from "./operations/routeTreeToDefinitions";

// =============================================================================
// Services
// =============================================================================

export { MatcherService } from "./services/MatcherService";

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
