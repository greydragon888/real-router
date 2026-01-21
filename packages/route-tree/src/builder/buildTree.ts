// packages/route-node/modules/builder/buildTree.ts

/**
 * Tree Building.
 *
 * Constructs the mutable tree structure from route definitions.
 *
 * @module builder/buildTree
 */

import { defaultParserFactory } from "../parser/defaultParserFactory";

import type { PathParser, RouteDefinition } from "../types";

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
  parser: PathParser | null;
  children: MutableRouteNode[];
  parent: MutableRouteNode | null;

  // These are computed later by computeCaches
  nonAbsoluteChildren: MutableRouteNode[];
  absoluteDescendants: MutableRouteNode[];
  childrenByName: Map<string, MutableRouteNode>;
  parentSegments: MutableRouteNode[];
  fullName: string;
  staticChildrenByFirstSegment: Map<string, MutableRouteNode[]>;
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
    parser: normalizedPath ? defaultParserFactory.create(normalizedPath) : null,
    children: [],
    parent,
    // These will be computed by computeCaches
    nonAbsoluteChildren: [],
    absoluteDescendants: [],
    childrenByName: new Map(),
    parentSegments: [],
    fullName: "",
    staticChildrenByFirstSegment: new Map(),
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
 * Resolves parent node for dot-notation names.
 *
 * For example, "users.profile" needs to find the "users" node first.
 *
 * @param root - Root node
 * @param name - Route name (possibly with dots)
 * @returns Parent node and final name segment
 */
function resolveParent(
  root: MutableRouteNode,
  name: string,
): { parent: MutableRouteNode; finalName: string } {
  const parts = name.split(".");

  if (parts.length === 1) {
    return { parent: root, finalName: name };
  }

  // Navigate to parent
  let current = root;

  for (let i = 0; i < parts.length - 1; i++) {
    const partName = parts[i];

    // validateRoutes ensures parent exists before building
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    current = current.children.find((c) => c.name === partName)!;
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { parent: current, finalName: parts.at(-1)! };
}

/**
 * Builds the mutable tree structure from route definitions.
 *
 * Handles:
 * - Creating root node
 * - Processing flat and nested routes
 * - Dot-notation names (e.g., "users.profile")
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
  // Create root node
  const root = createNode({ name: rootName, path: rootPath }, null);

  // First pass: add routes with nested children
  const flatRoutes: RouteDefinition[] = [];

  for (const route of routes) {
    if (route.name.includes(".")) {
      // Dot-notation name - process later
      flatRoutes.push(route);
    } else if (route.children && route.children.length > 0) {
      // Has children - add directly
      const node = createNode(route, root);

      root.children.push(node);
    } else {
      // Simple route without children
      flatRoutes.push(route);
    }
  }

  // Second pass: add flat routes and dot-notation names
  for (const route of flatRoutes) {
    const { parent, finalName } = resolveParent(root, route.name);

    const node = createNode(
      { name: finalName, path: route.path, children: route.children },
      parent,
    );

    parent.children.push(node);
  }

  return root;
}
