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
// Shared Sentinels (avoid per-node allocation for leaf nodes)
// =============================================================================

const EMPTY_CHILDREN_MAP: ReadonlyMap<string, RouteTree> = Object.freeze(
  new Map<string, RouteTree>(),
);
const EMPTY_CHILDREN_ARRAY: readonly RouteTree[] = Object.freeze(
  [] as RouteTree[],
);

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
  if (!node.path) {
    return null;
  }

  const { urlParams, queryParams, spatParams } = node.paramMeta;

  if (urlParams.length > 0 || queryParams.length > 0 || spatParams.length > 0) {
    return null;
  }

  if (node.absolute) {
    return node.path;
  }

  // Parent staticPath is always computed before children (processNode is recursive).
  // null staticPath means parent has params OR parent has no path (root/grouping node).
  // Distinguish: no-path parent (staticPath=null, path="") → use "" as base.
  //              parameterized parent (staticPath=null, path!="") → propagate null.
  const parent = node.parent;

  if (parent?.path) {
    if (parent.staticPath === null) {
      return null;
    }

    return joinPaths(parent.staticPath, node.path);
  }

  // Parent has no path (root or grouping node) — start fresh
  return node.path;
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
  const paramTypeMap = paramMeta.paramTypeMap;

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
  node.staticPath = computeStaticPath(node as RouteTree);

  if (mutable.children.length === 0) {
    node.children = EMPTY_CHILDREN_MAP;
    node.nonAbsoluteChildren = EMPTY_CHILDREN_ARRAY as RouteTree[];
  } else {
    const { childrenMap, nonAbsoluteChildren } = processChildren(
      mutable.children,
      node as RouteTree,
      freeze,
    );

    node.children = childrenMap;
    node.nonAbsoluteChildren = nonAbsoluteChildren;
  }

  if (freeze) {
    if (mutable.children.length > 0) {
      Object.freeze(node.nonAbsoluteChildren);
      Object.freeze(node.children);
    }

    Object.freeze(paramTypeMap);
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
