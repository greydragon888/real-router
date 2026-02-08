// packages/route-tree/src/services/types.ts

/**
 * Services Module Type Definitions.
 *
 * Types for route matching services.
 *
 * @module services/types
 */

import type { RouteTree } from "../builder/types";
import type {
  MatchOptions,
  MatchResult,
  RouteTreeStateMeta,
} from "../operations/types";

// =============================================================================
// Route Matcher Service
// =============================================================================

/**
 * Service interface for route matching and tree management.
 *
 * Provides high-level operations for registering route trees,
 * matching paths, and querying route information.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IMatcherService {
  /**
   * Register a route tree for matching.
   *
   * @param node - Root node of the route tree to register
   * @param parentPath - Optional parent path for nested trees
   */
  registerTree: (node: RouteTree, parentPath?: string) => void;

  /**
   * Match a path against registered route trees.
   *
   * @param path - Path to match
   * @param options - Matching options
   * @returns Match result if path matches, undefined otherwise
   */
  match: (path: string, options?: MatchOptions) => MatchResult | undefined;

  /**
   * Get all route segments by name.
   *
   * @param name - Route name (dot-notation, e.g., "users.profile")
   * @returns Array of route segments if found, undefined otherwise
   */
  getSegmentsByName: (name: string) => readonly RouteTree[] | undefined;

  /**
   * Get pre-computed meta by route name.
   *
   * @param name - Route name (dot-notation, e.g., "users.profile")
   * @returns Frozen meta object if found, undefined otherwise
   */
  getMetaByName: (name: string) => Readonly<RouteTreeStateMeta> | undefined;

  /**
   * Check if a route exists by name.
   *
   * @param name - Route name (dot-notation, e.g., "users.profile")
   * @returns true if route exists, false otherwise
   */
  hasRoute: (name: string) => boolean;
}
