/**
 * Route Tree Type Definitions.
 *
 * Central re-export hub for all module-specific types.
 * Import from this file for convenience, or directly from
 * module-specific files for more explicit dependencies.
 *
 * @module types
 */

// =============================================================================
// Builder Types
// =============================================================================

export type { RouteDefinition, RouteTree } from "./builder/types";

// =============================================================================
// Operations Types
// =============================================================================

export type {
  RouteTreeStateMeta,
  RouteParams,
  MatchResult,
  RouteTreeState,
} from "./operations/types";
