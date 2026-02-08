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

export { getSegmentsByName } from "./operations/query";

export {
  routeTreeToDefinitions,
  nodeToDefinition,
} from "./operations/routeTreeToDefinitions";

// =============================================================================
// Matcher Factory (encapsulates SegmentMatcher + search-params DI)
// =============================================================================

export { createMatcher } from "./createMatcher";

export type {
  CreateMatcherOptions,
  Matcher,
  QueryParamsConfig,
} from "./createMatcher";

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
