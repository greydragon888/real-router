// packages/route-node/modules/builder/sortTree.ts

/**
 * Tree Sorting.
 *
 * Sorts route children by routing priority.
 *
 * @module builder/sortTree
 */

import type { MutableRouteNode } from "./buildTree";

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Removes trailing slash from path, preserving root "/".
 */
function removeTrailingSlash(path: string): string {
  return path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
}

/**
 * Normalizes path for comparison by removing query params and trailing slash.
 * Also removes route parameters (e.g., `<id>`) for comparison purposes.
 */
function normalizePath(path: string): string {
  // Remove route parameters (e.g., <id>, <userId>)
  // Note: Angle bracket syntax is for internal path representation,
  // not typically used directly in route definitions
  let withoutParams = "";
  let depth = 0;

  for (const char of path) {
    if (char === "<") {
      depth++;
    } else if (char === ">") {
      depth--;
    } else if (depth === 0) {
      withoutParams += char;
    }
  }

  const withoutQuery = withoutParams.split("?")[0];

  return removeTrailingSlash(withoutQuery);
}

// =============================================================================
// Sorting Implementation
// =============================================================================

/**
 * Pre-computed data for sorting comparison.
 */
interface PrecomputedSortData {
  readonly normalizedPath: string;
  readonly segmentCount: number;
  readonly lastSegmentLength: number;
  readonly originalIndex: number;
}

/**
 * Sorts children by routing priority.
 *
 * Priority (highest to lowest):
 * 1. Routes with more path segments
 * 2. Routes without splat parameters
 * 3. Routes with fewer URL parameters
 * 4. Routes with longer last segment
 * 5. Original definition order (stable sort)
 *
 * @param children - Array to sort (MUTATED in place)
 */
function sortChildren(children: MutableRouteNode[]): void {
  if (children.length <= 1) {
    return;
  }

  // Pre-compute all derived data O(n)
  const precomputed = new Map<MutableRouteNode, PrecomputedSortData>();

  for (const [i, child] of children.entries()) {
    const normalizedPath = normalizePath(child.path);
    const segments = normalizedPath.split("/");
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastSegment = segments.at(-1)!;

    precomputed.set(child, {
      normalizedPath,
      segmentCount: segments.length - 1,
      lastSegmentLength: lastSegment.length,
      originalIndex: i,
    });
  }

  // Sort using pre-computed data O(n log n)
  children.sort((left, right) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const l = precomputed.get(left)!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const r = precomputed.get(right)!;

    // "/" always sorts last
    if (l.normalizedPath === "/") {
      return 1;
    }
    if (r.normalizedPath === "/") {
      return -1;
    }

    // Splat params sort last
    // All children have parsers by design (only empty root lacks parser)
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    if (left.parser!.hasSpatParam) {
      return 1;
    }
    if (right.parser!.hasSpatParam) {
      return -1;
    }
    /* eslint-enable @typescript-eslint/no-non-null-assertion */

    // More segments = higher priority
    if (l.segmentCount < r.segmentCount) {
      return 1;
    }
    if (l.segmentCount > r.segmentCount) {
      return -1;
    }

    // Same segments: fewer URL params = higher priority
    // All children have parsers by design (only empty root lacks parser)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const leftParamsCount = left.parser!.urlParams.length;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const rightParamsCount = right.parser!.urlParams.length;

    if (leftParamsCount < rightParamsCount) {
      return -1;
    }
    if (leftParamsCount > rightParamsCount) {
      return 1;
    }

    // Same params: longer last segment = higher priority
    if (l.lastSegmentLength < r.lastSegmentLength) {
      return 1;
    }
    if (l.lastSegmentLength > r.lastSegmentLength) {
      return -1;
    }

    // Preserve definition order (stable sort fallback)
    return l.originalIndex - r.originalIndex;
  });
}

/**
 * Recursively sorts all children in the tree.
 *
 * @param node - Root node of the tree
 */
export function sortTree(node: MutableRouteNode): void {
  // Sort this node's children
  sortChildren(node.children);

  // Recursively sort descendants
  for (const child of node.children) {
    sortTree(child);
  }
}
