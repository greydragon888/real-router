// packages/route-tree/modules/builder/types.ts

/**
 * Builder Module Type Definitions.
 *
 * Types for route tree construction and data structures.
 *
 * @module builder/types
 */

import type { Options as QueryParamsOptions } from "search-params";

// =============================================================================
// Path Parser Types
// =============================================================================

/**
 * Options for building a path from parameters.
 */
export interface PathBuildOptions {
  ignoreSearch?: boolean;
  urlParamsEncoding?: "default" | "uri" | "uriComponent" | "none" | "legacy";
  queryParams?: QueryParamsOptions;
}

/**
 * Options for testing/matching a path.
 */
export interface PathTestOptions {
  caseSensitive?: boolean;
  queryParams?: QueryParamsOptions;
  urlParamsEncoding?: "default" | "uri" | "uriComponent" | "none" | "legacy";
  delimited?: boolean;
  strictTrailingSlash?: boolean;
}

/**
 * Interface for path parsing and building.
 */
export interface PathParser {
  readonly path: string;
  readonly urlParams: string[];
  readonly queryParams: string[];
  readonly spatParams: string[];
  readonly hasUrlParams: boolean;
  readonly hasSpatParam: boolean;
  readonly hasMatrixParams: boolean;
  readonly hasQueryParams: boolean;
  build: (
    params?: Record<string, unknown>,
    options?: PathBuildOptions,
  ) => string;
  test: (
    path: string,
    options?: PathTestOptions,
  ) => Record<string, unknown> | null;
  partialTest: (
    path: string,
    options?: PathTestOptions,
  ) => Record<string, unknown> | null;
}

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

/**
 * Callback invoked when a route is added.
 */
export type Callback = (route: RouteDefinition) => void;

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
 * - childrenByName: Map for O(1) child lookup
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

  /** Path parser (null for root node without path) */
  readonly parser: PathParser | null;

  /** Child route nodes */
  readonly children: readonly RouteTree[];

  // === Pre-computed Caches ===

  /** Parent node (null for root) */
  readonly parent: RouteTree | null;

  /** Children without absolute paths (for regular matching) */
  readonly nonAbsoluteChildren: readonly RouteTree[];

  /** All descendants with absolute paths (recursive, for absolute matching) */
  readonly absoluteDescendants: readonly RouteTree[];

  /** Map of child name -> child node for O(1) lookup */
  readonly childrenByName: ReadonlyMap<string, RouteTree>;

  /** Path from root to this node's parent (for building full paths) */
  readonly parentSegments: readonly RouteTree[];

  /** Pre-computed full name (e.g., "users.profile") */
  readonly fullName: string;

  /**
   * Pre-computed static path for routes without parameters.
   * Used by buildPath fast path to avoid parser.build() overhead.
   * Only set when route has no URL params, query params, or splat params.
   */
  readonly staticPath: string | null;

  /**
   * Pre-computed parameter type map for this segment.
   * Cached to avoid recomputing on every navigation.
   * Maps param name → "url" | "query".
   */
  readonly paramTypeMap: Readonly<Record<string, "url" | "query">>;

  /**
   * Index for O(1) lookup of static children by first path segment.
   *
   * Key: first static segment (e.g., "users" for "/users" or "/users/:id")
   * Value: array of routes starting with this segment
   *
   * Used by matchChildren() to skip linear search for static routes.
   * Empty map for nodes with no static children.
   *
   * @example
   * // For routes: /users, /products, /users/:id
   * staticChildrenByFirstSegment.get("users") → [UsersRoute, UsersIdRoute]
   * staticChildrenByFirstSegment.get("products") → [ProductsRoute]
   */
  readonly staticChildrenByFirstSegment: ReadonlyMap<
    string,
    readonly RouteTree[]
  >;
}

/**
 * Options for building a route tree.
 */
export interface TreeBuildOptions {
  /**
   * Skip validation when building the tree.
   * Use this only when routes have already been validated externally.
   *
   * @default false
   */
  skipValidation?: boolean;

  /**
   * Skip sorting children when building the tree.
   * Use this when routes are already sorted by priority, or when sorting
   * is not needed (e.g., for read-only trees where order doesn't matter).
   *
   * @default false
   */
  skipSort?: boolean;

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
   * 1. Validate all routes (unless skipValidation is true)
   * 2. Build the tree structure
   * 3. Compute all caches
   * 4. Sort children for correct matching order
   * 5. Freeze and return the tree
   *
   * @param options - Build options
   * @returns Immutable RouteTree
   * @throws {Error} If validation fails
   */
  build: (options?: TreeBuildOptions) => RouteTree;
}

// =============================================================================
// Public Minimal Interfaces
// =============================================================================

/**
 * Minimal interface for route segments used in metadata building.
 * This is the public interface accepted by getMetaFromSegments().
 */
export interface RouteSegmentMeta {
  readonly name: string;
  readonly parser: PathParser | null;
}
