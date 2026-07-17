// packages/route-node/modules/builder/computeCaches.ts

/**
 * Cache Computation.
 *
 * Computes all pre-computed caches and freezes the tree.
 *
 * @module builder/computeCaches
 */

import { buildParamMeta, EMPTY_PARAM_META } from "../path-matcher";

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
 * @returns Children map and non-absolute children array
 */
function processChildren(
  mutableChildren: readonly MutableRouteNode[],
  parent: RouteTree,
): {
  childrenMap: ReadonlyMap<string, RouteTree>;
  nonAbsoluteChildren: RouteTree[];
} {
  const childrenArray: RouteTree[] = [];
  const nonAbsoluteChildren: RouteTree[] = [];

  for (const childMutable of mutableChildren) {
    const child = processNode(childMutable, parent);

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
 * Recursively processes a mutable node into a frozen RouteTree.
 *
 * This creates a new object with all caches computed and freezes it for
 * immutability.
 *
 * @param mutable - Mutable node to process
 * @param parent - Already-processed parent node (null for root)
 * @returns Frozen RouteTree
 */
function processNode(
  mutable: MutableRouteNode,
  parent: RouteTree | null,
): RouteTree {
  const freshParamMeta = buildParamMeta(mutable.path);
  // Fully-static node: every collection is a #1009 sentinel and pathPattern is
  // reference-equal to the input path (no query was sliced off) — the wrapper
  // carries zero information, so retain the ONE shared frozen EMPTY_PARAM_META
  // instead of a fresh 6-field object per node. The swap happens here (the
  // retaining consumer), NOT inside buildParamMeta: the validation gate reads
  // `pathPattern` off fresh results and must keep seeing the real pattern.
  const paramMeta =
    freshParamMeta.urlParams.length === 0 &&
    freshParamMeta.queryParams.length === 0 &&
    freshParamMeta.spatParams.length === 0 &&
    freshParamMeta.constraintPatterns.size === 0 &&
    freshParamMeta.pathPattern === mutable.path
      ? EMPTY_PARAM_META
      : freshParamMeta;
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
    // Stryker disable next-line StringLiteral: equivalent — placeholder overwritten unconditionally on the next statement (`node.fullName = computeFullName(node)`); the initial value is never observed.
    fullName: "",
    paramTypeMap,
  };

  node.fullName = computeFullName(node);

  if (mutable.children.length === 0) {
    node.children = EMPTY_CHILDREN_MAP;
    node.nonAbsoluteChildren = EMPTY_CHILDREN_ARRAY as RouteTree[];
  } else {
    const { childrenMap, nonAbsoluteChildren } = processChildren(
      mutable.children,
      node,
    );

    node.children = childrenMap;
    node.nonAbsoluteChildren = nonAbsoluteChildren;

    Object.freeze(node.nonAbsoluteChildren);
    Object.freeze(node.children);
  }

  Object.freeze(paramTypeMap);

  // Close the immutability contract on the nested paramMeta (#747): the node
  // is frozen, but its paramMeta object and arrays were left mutable, so a
  // tree reachable from the public API could be mutated. paramTypeMap is the
  // same ref frozen just above. constraintPatterns is a Map — intentionally
  // not frozen here (Object.freeze can't lock Map entries); it is protected
  // at the type level via ReadonlyMap (CC2 documents this exception).
  Object.freeze(paramMeta.urlParams);
  Object.freeze(paramMeta.queryParams);
  Object.freeze(paramMeta.spatParams);
  Object.freeze(paramMeta);

  Object.freeze(node);

  return node;
}

/**
 * Computes all caches and freezes the tree.
 *
 * This is the final step in building a RouteTree — the result is completely
 * immutable.
 *
 * @param mutableRoot - Mutable root node
 * @returns Frozen RouteTree
 */
export function computeCaches(mutableRoot: MutableRouteNode): RouteTree {
  return processNode(mutableRoot, null);
}
