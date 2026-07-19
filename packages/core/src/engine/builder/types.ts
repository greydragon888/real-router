/**
 * Builder Module Type Definitions.
 *
 * Types for route tree construction and data structures.
 *
 * @module builder/types
 */

import type { ParamMeta } from "../path-matcher";

// =============================================================================
// Route Definition Types
// =============================================================================

/**
 * Definition of a route for configuration.
 */
export interface RouteDefinition {
  [key: string]: unknown;
  name: string;
  path: string;
  children?: RouteDefinition[] | undefined;
}

// =============================================================================
// Route Tree Data Structure
// =============================================================================

/**
 * Immutable route tree node.
 *
 * This is the core data structure of the new route-tree architecture.
 * It contains only data (no methods) and is created by the builder.
 *
 * All caches are pre-computed at build time:
 * - nonAbsoluteChildren: filtered children without absolute paths
 * - fullName: pre-computed "users.profile" instead of runtime join
 */
export interface RouteTree {
  // === Core Properties ===

  /** Route segment name (e.g., "users" in "users.profile") */
  readonly name: string;

  /** Route path pattern (e.g., "/users/:id") */
  readonly path: string;

  /** Whether this route uses absolute path matching (path starts with "~") */
  readonly absolute: boolean;

  /** Child route nodes (Map for O(1) lookup by name) */
  readonly children: ReadonlyMap<string, RouteTree>;

  /** Parameter metadata extracted from path pattern (replaces parser dependency) */
  readonly paramMeta: ParamMeta;

  // === Pre-computed Caches ===

  /** Parent node (null for root) */
  readonly parent: RouteTree | null;

  /** Children without absolute paths (for regular matching) */
  readonly nonAbsoluteChildren: readonly RouteTree[];

  /** Pre-computed full name (e.g., "users.profile") */
  readonly fullName: string;

  /**
   * Pre-computed parameter type map for this segment.
   * Cached to avoid recomputing on every navigation.
   * Maps param name → "url" | "query".
   */
  readonly paramTypeMap: Readonly<Record<string, "url" | "query">>;
}
