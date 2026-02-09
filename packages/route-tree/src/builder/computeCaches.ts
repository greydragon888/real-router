// packages/route-node/modules/builder/computeCaches.ts

/**
 * Cache Computation.
 *
 * Computes all pre-computed caches and freezes the tree.
 *
 * @module builder/computeCaches
 */

import { buildParamMeta } from "path-matcher";

import type { MutableRouteNode } from "./buildTree";
import type { RouteTree } from "../types";

// =============================================================================
// Cache Computation Functions
// =============================================================================

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
 * Joins two path segments, preventing double slashes at the join point.
 *
 * @param base - Base path (e.g., "/users/")
 * @param suffix - Path to append (e.g., "/profile")
 * @returns Joined path without double slashes (e.g., "/users/profile")
 */
function joinPaths(base: string, suffix: string): string {
  if (base.endsWith("/") && suffix.startsWith("/")) {
    return base + suffix.slice(1);
  }

  return base + suffix;
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
  // Root nodes without path patterns can't have static paths
  if (!node.path) {
    return null;
  }

  const { urlParams, queryParams, spatParams } = node.paramMeta;

  // If route has any parameters, we can't pre-compute
  if (urlParams.length > 0 || queryParams.length > 0 || spatParams.length > 0) {
    return null;
  }

  // Build the full path from parent segments + this segment
  // Collect parent segments via parent chain (unshift for correct order)
  const parentSegments: RouteTree[] = [];
  let current = node.parent;

  while (current?.path) {
    parentSegments.unshift(current);
    current = current.parent;
  }

  let path = "";

  for (const segment of parentSegments) {
    const {
      urlParams: segUrlParams,
      queryParams: segQueryParams,
      spatParams: segSpatParams,
    } = segment.paramMeta;

    // Parent segments with params invalidate static path
    if (
      segUrlParams.length > 0 ||
      segQueryParams.length > 0 ||
      segSpatParams.length > 0
    ) {
      return null;
    }

    path = segment.absolute ? segment.path : joinPaths(path, segment.path);
  }

  // Add this node's path
  return node.absolute ? node.path : joinPaths(path, node.path);
}

// =============================================================================
// Main Computation Function
// =============================================================================

/**
 * Computes children Map from mutable children array.
 *
 * Children are stored in definition order. Matching priority is handled
 * by the segment trie, not by iteration order.
 *
 * @param childrenArray - Array of processed child nodes
 * @returns ReadonlyMap of child name -> child node (in definition order)
 */
function computeChildrenMap(
  childrenArray: RouteTree[],
): ReadonlyMap<string, RouteTree> {
  const map = new Map<string, RouteTree>();

  for (const child of childrenArray) {
    map.set(child.name, child);
  }

  return map;
}

/**
 * Builds a paramTypeMap from route parameter metadata.
 *
 * @param paramMeta - Parameter metadata from buildParamMeta
 * @param paramMeta.urlParams - URL parameter names
 * @param paramMeta.queryParams - Query parameter names
 * @returns Map of parameter names to their types
 */
function buildParamTypeMap(paramMeta: {
  readonly urlParams: readonly string[];
  readonly queryParams: readonly string[];
}): Record<string, "url" | "query"> {
  const map: Record<string, "url" | "query"> = {};

  for (const p of paramMeta.urlParams) {
    map[p] = "url";
  }

  for (const p of paramMeta.queryParams) {
    map[p] = "query";
  }

  return map;
}

/**
 * Recursively processes child nodes and computes the children map.
 *
 * @param mutableChildren - Array of mutable child nodes
 * @param parent - Already-processed parent node
 * @param freeze - Whether to freeze the result
 * @returns Children map and non-absolute children array
 */
function processChildren(
  mutableChildren: readonly MutableRouteNode[],
  parent: RouteTree,
  freeze: boolean,
): {
  childrenMap: ReadonlyMap<string, RouteTree>;
  nonAbsoluteChildren: RouteTree[];
} {
  const childrenArray: RouteTree[] = [];
  const nonAbsoluteChildren: RouteTree[] = [];

  for (const childMutable of mutableChildren) {
    const child = processNode(childMutable, parent, freeze);

    childrenArray.push(child);

    if (!child.absolute) {
      nonAbsoluteChildren.push(child);
    }
  }

  return {
    childrenMap: computeChildrenMap(childrenArray),
    nonAbsoluteChildren,
  };
}

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
  const paramMeta = buildParamMeta(mutable.path);
  const paramTypeMap = buildParamTypeMap(paramMeta);

  // Skeleton node: children and nonAbsoluteChildren are set after recursive
  // child processing, which requires a parent reference to this node.
  const node = {
    name: mutable.name,
    path: mutable.path,
    absolute: mutable.absolute,
    parent,
    children: undefined as unknown as ReadonlyMap<string, RouteTree>,
    paramMeta,
    nonAbsoluteChildren: undefined as unknown as RouteTree[],
    fullName: "",
    staticPath: null as string | null,
    paramTypeMap,
  };

  node.fullName = computeFullName(node as RouteTree);

  const { childrenMap, nonAbsoluteChildren } = processChildren(
    mutable.children,
    node as RouteTree,
    freeze,
  );

  node.children = childrenMap;
  node.nonAbsoluteChildren = nonAbsoluteChildren;
  node.staticPath = computeStaticPath(node as RouteTree);

  if (freeze) {
    Object.freeze(nonAbsoluteChildren);
    Object.freeze(paramTypeMap);
    Object.freeze(node.children);
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
