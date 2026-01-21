// packages/route-node/modules/builder/computeCaches.ts

/**
 * Cache Computation.
 *
 * Computes all pre-computed caches and freezes the tree.
 *
 * @module builder/computeCaches
 */

import type { MutableRouteNode } from "./buildTree";
import type { RouteTree } from "../types";

// =============================================================================
// Constants
// =============================================================================

/** Shared empty map for nodes with no static children (avoids allocation) */
const EMPTY_STATIC_INDEX: ReadonlyMap<string, readonly RouteTree[]> = new Map();

// =============================================================================
// Static Children Index
// =============================================================================

/**
 * Extracts the first static segment from a path pattern.
 *
 * Returns null for dynamic-only paths (starting with :param or *splat).
 *
 * @example
 * extractFirstStaticSegment("/users") → "users"
 * extractFirstStaticSegment("/users/:id") → "users"
 * extractFirstStaticSegment("/users?tab") → "users"
 * extractFirstStaticSegment("/:id") → null (dynamic)
 * extractFirstStaticSegment("*") → null (splat)
 * extractFirstStaticSegment("/") → null (root slash)
 *
 * @param path - Path pattern (without ~ prefix)
 * @returns First static segment or null if dynamic
 */
function extractFirstStaticSegment(path: string): string | null {
  // Skip leading slash
  const start = path.startsWith("/") ? 1 : 0;

  // Find end of first segment: next "/" or "?" (whichever comes first)
  let end = path.indexOf("/", start);
  const queryPos = path.indexOf("?", start);

  if (queryPos !== -1 && (end === -1 || queryPos < end)) {
    end = queryPos;
  }

  const segment = end === -1 ? path.slice(start) : path.slice(start, end);

  // Dynamic segments start with : or *, empty segment means root "/"
  if (
    segment === "" ||
    segment.startsWith(":") ||
    segment.startsWith("*") ||
    segment.includes("(") // optional segment like (locale)
  ) {
    return null;
  }

  // Normalize to lowercase for case-insensitive index lookup
  return segment.toLowerCase();
}

/**
 * Computes static children index for O(1) matching.
 *
 * Groups non-absolute children by their first static path segment.
 * Routes with dynamic first segments are not indexed (matched via linear search).
 *
 * @param children - Non-absolute children to index
 * @param freeze - Whether to freeze the result
 * @returns Map of first segment → routes
 */
function computeStaticChildrenIndex(
  children: readonly RouteTree[],
  freeze: boolean,
): ReadonlyMap<string, readonly RouteTree[]> {
  if (children.length === 0) {
    return EMPTY_STATIC_INDEX;
  }

  const index = new Map<string, RouteTree[]>();

  for (const child of children) {
    const segment = extractFirstStaticSegment(child.path);

    if (segment !== null) {
      const existing = index.get(segment);

      if (existing) {
        existing.push(child);
      } else {
        index.set(segment, [child]);
      }
    }
  }

  // No static children found
  if (index.size === 0) {
    return EMPTY_STATIC_INDEX;
  }

  // Freeze arrays for immutability
  // Cast needed: Object.freeze returns readonly[], but we return ReadonlyMap anyway
  if (freeze) {
    for (const [key, arr] of index) {
      index.set(key, Object.freeze(arr) as RouteTree[]);
    }
  }

  return index;
}

// =============================================================================
// Cache Computation Functions
// =============================================================================

/**
 * Recursively collects all descendants with absolute paths.
 *
 * @param node - Node to collect from
 * @param result - Array to collect into
 */
function collectAbsoluteDescendants(
  node: RouteTree,
  result: RouteTree[],
): void {
  for (const child of node.children) {
    if (child.absolute) {
      result.push(child);
    }

    collectAbsoluteDescendants(child, result);
  }
}

/**
 * Computes all absolute descendants recursively.
 *
 * @param node - Node to start from
 * @returns Array of all absolute descendants
 */
function computeAbsoluteDescendants(node: RouteTree): readonly RouteTree[] {
  const result: RouteTree[] = [];

  collectAbsoluteDescendants(node, result);

  return result;
}

/**
 * Computes parent segments from root to this node's parent.
 *
 * @param node - Node to compute for
 * @returns Array of parent segments
 */
function computeParentSegments(node: RouteTree): readonly RouteTree[] {
  const segments: RouteTree[] = [];
  let current = node.parent;

  while (current?.parser) {
    segments.push(current);
    current = current.parent;
  }

  // Reverse to get root -> parent order
  segments.reverse();

  return segments;
}

/**
 * Computes the full dot-notation name for a node.
 * Parent fullName is always computed before children.
 *
 * @param node - Node to compute for
 * @returns Full name (e.g., "users.profile")
 */
function computeFullName(node: RouteTree): string {
  if (!node.parent?.name) {
    return node.name;
  }

  // Parent fullName is always set before children are processed
  return `${node.parent.fullName}.${node.name}`;
}

/**
 * Computes static path for routes without parameters.
 *
 * Returns pre-built path string for fast buildPath lookup,
 * or null if the route has any dynamic parameters.
 *
 * @param node - Node to compute for
 * @returns Static path or null
 */
function computeStaticPath(node: RouteTree): string | null {
  const parser = node.parser;

  if (!parser) {
    return null;
  }

  // If route has any parameters, we can't pre-compute
  if (parser.hasUrlParams || parser.hasQueryParams || parser.hasSpatParam) {
    return null;
  }

  // Build the full path from parent segments + this segment
  // Note: parentSegments only contains nodes with parsers (see computeParentSegments)
  let path = "";

  for (const segment of node.parentSegments) {
    // parentSegments only contains nodes with parsers (see computeParentSegments)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- by design
    const segmentParser = segment.parser!;

    // Parent segments with params invalidate static path
    if (
      segmentParser.hasUrlParams ||
      segmentParser.hasQueryParams ||
      segmentParser.hasSpatParam
    ) {
      return null;
    }

    path = segment.absolute ? segment.path : path + segment.path;
  }

  // Add this node's path
  path = node.absolute ? node.path : path + node.path;

  // Normalize double slashes - always apply regex (avoids equivalent mutants)
  return path.replaceAll(/\/{2,}/g, "/");
}

// =============================================================================
// Main Computation Function
// =============================================================================

/**
 * Recursively processes a mutable node into a RouteTree.
 *
 * This creates a new object with all caches computed.
 * Optionally freezes the result for immutability.
 *
 * @param mutable - Mutable node to process
 * @param parent - Already-processed parent node (null for root)
 * @param freeze - Whether to freeze the result
 * @returns RouteTree (frozen if freeze=true)
 */
function processNode(
  mutable: MutableRouteNode,
  parent: RouteTree | null,
  freeze: boolean,
): RouteTree {
  // Create node object with pre-allocated arrays
  const node = {
    name: mutable.name,
    path: mutable.path,
    absolute: mutable.absolute,
    parser: mutable.parser,
    parent,
    children: [] as RouteTree[],
    nonAbsoluteChildren: [] as RouteTree[],
    absoluteDescendants: [] as RouteTree[],
    childrenByName: new Map<string, RouteTree>(),
    parentSegments: [] as RouteTree[],
    fullName: "",
    staticPath: null as string | null,
    paramTypeMap: {} as Record<string, "url" | "query">,
    staticChildrenByFirstSegment: EMPTY_STATIC_INDEX,
  };

  // Compute paramTypeMap from parser (cached to avoid recomputing on every navigation)
  if (mutable.parser) {
    for (const p of mutable.parser.urlParams) {
      node.paramTypeMap[p] = "url";
    }

    for (const p of mutable.parser.queryParams) {
      node.paramTypeMap[p] = "query";
    }
  }

  // Compute fullName first (needs parent)
  node.fullName = computeFullName(node as RouteTree);

  // Process children and build childrenByName in single pass
  for (const childMutable of mutable.children) {
    const child = processNode(childMutable, node as RouteTree, freeze);

    node.children.push(child);
    node.childrenByName.set(child.name, child);

    // Build nonAbsoluteChildren inline
    if (!child.absolute) {
      node.nonAbsoluteChildren.push(child);
    }
  }

  // Compute absoluteDescendants (recursive collection)
  node.absoluteDescendants = computeAbsoluteDescendants(
    node as RouteTree,
  ) as RouteTree[];

  // Compute parentSegments
  node.parentSegments = computeParentSegments(node as RouteTree) as RouteTree[];

  // Compute staticPath for fast buildPath lookup
  node.staticPath = computeStaticPath(node as RouteTree);

  // Compute static children index for O(1) matching
  node.staticChildrenByFirstSegment = computeStaticChildrenIndex(
    node.nonAbsoluteChildren,
    freeze,
  );

  // Freeze only if requested
  if (freeze) {
    Object.freeze(node.children);
    Object.freeze(node.nonAbsoluteChildren);
    Object.freeze(node.absoluteDescendants);
    Object.freeze(node.parentSegments);
    Object.freeze(node.paramTypeMap);
    Object.freeze(node);
  }

  return node as RouteTree;
}

/**
 * Computes all caches and optionally freezes the tree.
 *
 * This is the final step in building a RouteTree.
 * When freeze=true (default), the tree is completely immutable.
 *
 * @param mutableRoot - Mutable root node
 * @param freeze - Whether to freeze the result (default: true)
 * @returns RouteTree (frozen if freeze=true)
 */
export function computeCaches(
  mutableRoot: MutableRouteNode,
  freeze = true,
): RouteTree {
  return processNode(mutableRoot, null, freeze);
}
