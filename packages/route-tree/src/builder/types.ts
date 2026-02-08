// packages/route-tree/modules/builder/types.ts

/**
 * Builder Module Type Definitions.
 *
 * Types for route tree construction and data structures.
 *
 * @module builder/types
 */

import type { ParamMeta } from "path-matcher";

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
 * - absoluteDescendants: all descendants with absolute paths (recursive)
 * - parentSegments: array from root to parent
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
   * Pre-computed static path for routes without parameters.
   * Used by buildPath fast path to avoid inject() overhead.
   * Only set when route has no URL params, query params, or splat params.
   */
  readonly staticPath: string | null;

  /**
   * Pre-computed parameter type map for this segment.
   * Cached to avoid recomputing on every navigation.
   * Maps param name → "url" | "query".
   */
  readonly paramTypeMap: Readonly<Record<string, "url" | "query">>;
}

/**
 * Options for building a route tree.
 */
export interface TreeBuildOptions {
  /**
   * Skip freezing the tree after building.
   * This improves performance but allows mutation of the tree.
   * Use this only when you can guarantee the tree won't be mutated.
   *
   * @default false
   */
  skipFreeze?: boolean;
}

/**
 * Builder for creating route trees.
 *
 * Use createRouteTreeBuilder() to create an instance.
 * Call add() or addMany() to add routes, then build() to get the final tree.
 *
 * @example
 * ```typescript
 * const tree = createRouteTreeBuilder("", "")
 *   .add({ name: "users", path: "/users" })
 *   .add({ name: "users.profile", path: "/:id" })
 *   .build();
 * ```
 */
export interface RouteTreeBuilder {
  /**
   * Add a single route definition.
   *
   * @param route - Route to add
   * @returns this for chaining
   */
  add: (route: RouteDefinition) => RouteTreeBuilder;

  /**
   * Add multiple route definitions.
   *
   * @param routes - Routes to add
   * @returns this for chaining
   */
  addMany: (routes: readonly RouteDefinition[]) => RouteTreeBuilder;

  /**
   * Build the final immutable route tree.
   *
   * This will:
   * 1. Build the tree structure
   * 2. Register routes with rou3 radix tree for matching
   * 3. Compute all caches
   * 4. Freeze and return the tree
   *
   * @param options - Build options
   * @returns Immutable RouteTree
   */
  build: (options?: TreeBuildOptions) => RouteTree;
}
