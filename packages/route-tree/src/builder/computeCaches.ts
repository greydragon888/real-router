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
  // Collect parent segments via parent chain (same logic as computeParentSegments)
  const parentSegments: RouteTree[] = [];
  let current = node.parent;

  while (current?.path) {
    parentSegments.push(current);
    current = current.parent;
  }

  parentSegments.reverse();

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
 * Computes children Map from mutable children array.
 *
 * Children are stored in definition order. Matching priority is handled
 * by rou3's radix tree, not by iteration order.
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
  const childrenArray: RouteTree[] = [];
  const nonAbsoluteChildren: RouteTree[] = [];

  const paramMeta = buildParamMeta(mutable.path);

  const node = {
    name: mutable.name,
    path: mutable.path,
    absolute: mutable.absolute,
    parent,
    children: new Map<string, RouteTree>() as ReadonlyMap<string, RouteTree>,
    paramMeta,
    nonAbsoluteChildren: [] as RouteTree[],
    fullName: "",
    staticPath: null as string | null,
    paramTypeMap: {} as Record<string, "url" | "query">,
  };

  for (const p of paramMeta.urlParams) {
    node.paramTypeMap[p] = "url";
  }

  for (const p of paramMeta.queryParams) {
    node.paramTypeMap[p] = "query";
  }

  node.fullName = computeFullName(node as RouteTree);

  for (const childMutable of mutable.children) {
    const child = processNode(childMutable, node as RouteTree, freeze);

    childrenArray.push(child);

    if (!child.absolute) {
      nonAbsoluteChildren.push(child);
    }
  }

  node.children = computeChildrenMap(childrenArray);
  node.nonAbsoluteChildren = nonAbsoluteChildren;

  node.staticPath = computeStaticPath(node as RouteTree);

  if (freeze) {
    Object.freeze(node.nonAbsoluteChildren);
    Object.freeze(node.paramTypeMap);
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
