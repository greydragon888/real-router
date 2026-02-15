// packages/route-node/modules/builder/buildTree.ts

/**
 * Tree Building.
 *
 * Constructs the mutable tree structure from route definitions.
 *
 * @module builder/buildTree
 */

import type { RouteDefinition } from "../types";

// =============================================================================
// Mutable Node Type (internal)
// =============================================================================

/**
 * Mutable version of RouteTree used during building.
 * After building, this is converted to immutable RouteTree.
 */
export interface MutableRouteNode {
  name: string;
  path: string;
  absolute: boolean;
  children: MutableRouteNode[];
  parent: MutableRouteNode | null;

  // These are computed later by computeCaches
  nonAbsoluteChildren: MutableRouteNode[];
  fullName: string;
}

// =============================================================================
// Building Functions
// =============================================================================

/**
 * Creates a mutable node from a route definition.
 *
 * @param definition - Route definition object
 * @param definition.name - Route name
 * @param definition.path - Route path
 * @param definition.children - Optional child routes
 * @param parent - Parent node (null for root)
 * @returns Mutable node
 */
function createNode(
  definition: {
    name: string;
    path: string;
    children?: RouteDefinition[] | undefined;
  },
  parent: MutableRouteNode | null,
): MutableRouteNode {
  const path = definition.path;
  const absolute = path.startsWith("~");
  const normalizedPath = absolute ? path.slice(1) : path;

  const node: MutableRouteNode = {
    name: definition.name,
    path: normalizedPath,
    absolute,
    children: [],
    parent,
    // These will be computed by computeCaches
    nonAbsoluteChildren: [],
    fullName: "",
  };

  // Recursively add children
  if (definition.children) {
    for (const childDef of definition.children) {
      const childNode = createNode(childDef, node);

      node.children.push(childNode);
    }
  }

  return node;
}

/**
 * Builds the mutable tree structure from route definitions.
 *
 * Simplified single-pass algorithm:
 * - Creates root node
 * - Adds each route as direct child of root
 * - createNode() handles nested children recursively
 *
 * @param rootName - Root node name (typically "")
 * @param rootPath - Root node path (typically "")
 * @param routes - Route definitions
 * @returns Mutable root node
 */
export function buildTree(
  rootName: string,
  rootPath: string,
  routes: readonly RouteDefinition[],
): MutableRouteNode {
  const root = createNode({ name: rootName, path: rootPath }, null);

  for (const route of routes) {
    const node = createNode(route, root);

    root.children.push(node);
  }

  return root;
}
