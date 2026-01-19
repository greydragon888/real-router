// packages/route-node/modules/operations/query.ts

/**
 * Route Query Operations.
 *
 * Pure functions for querying route information from the tree.
 *
 * @module operations/query
 */

import type { RouteTree } from "../types";

// =============================================================================
// Public API
// =============================================================================

/**
 * Finds route nodes by dot-notation name.
 *
 * Returns an array of segments from root to the target node.
 * All returned segments have parsers (root included only if it has parser).
 * Uses childrenByName Map for O(1) lookup at each level.
 *
 * @param tree - Route tree to search in
 * @param routeName - Dot-notation route name (e.g., "users.profile")
 * @returns Array of route segments or null if not found
 *
 * @example
 * ```typescript
 * const segments = getSegmentsByName(tree, "users.profile");
 * // → [usersNode, profileNode]
 * ```
 */
export function getSegmentsByName(
  tree: RouteTree,
  routeName: string,
): readonly RouteTree[] | null {
  const segments: RouteTree[] = [];

  // Optimize: avoid split() allocation for simple names without dots
  const names = routeName.includes(".") ? routeName.split(".") : [routeName];

  // Handle root with parser (include it as first segment)
  if (tree.parser) {
    segments.push(tree);
  }

  // Navigate through the tree using O(1) Map lookups
  let currentNode: RouteTree = tree;

  for (const name of names) {
    const segment = currentNode.childrenByName.get(name);

    if (!segment) {
      return null;
    }

    segments.push(segment);
    currentNode = segment;
  }

  return segments;
}

/**
 * Checks if a route exists in the tree by dot-notation name.
 * More efficient than getSegmentsByName when only existence check is needed.
 *
 * Avoids:
 * - Array allocation
 * - Array push operations
 *
 * @param tree - Route tree to search in
 * @param routeName - Dot-notation route name (e.g., "users.profile")
 * @returns true if route exists, false otherwise
 *
 * @example
 * ```typescript
 * const exists = hasSegmentsByName(tree, "users.profile");
 * // → true
 * ```
 */
export function hasSegmentsByName(tree: RouteTree, routeName: string): boolean {
  // Optimize: avoid split() allocation for simple names without dots
  const names = routeName.includes(".") ? routeName.split(".") : [routeName];

  // Navigate through the tree using O(1) Map lookups
  let currentNode: RouteTree = tree;

  for (const name of names) {
    const segment = currentNode.childrenByName.get(name);

    if (!segment) {
      return false;
    }

    currentNode = segment;
  }

  return true;
}
