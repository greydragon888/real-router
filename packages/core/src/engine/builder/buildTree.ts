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
  const stripped = absolute ? path.slice(1) : path;
  // #1407: normalize a missing leading "/". The trie, buildFullPath, and every
  // downstream layer assume a leading-"/" path; a non-absolute path without one
  // (`foo`, `:id`) fuses onto its parent across the segment boundary, and an
  // absolute `~foo` (slash-less) compiles a dead route (the trie scans from
  // index 1, dropping the first char). After the `~`-strip, prepend "/" to any
  // non-empty path that lacks it — `foo`/`~foo` → `/foo`, `:id` → `/:id`,
  // `foo?q` → `/foo?q` — leaving `/foo`/`~/foo` and the empty root untouched.
  // A query-only path (`?q`) has no leading path segment to slash (the `?` starts
  // the query), so it is skipped too. The path-matcher's "I only see leading-'/'
  // paths" invariant becomes correct-by-construction.
  const normalizedPath =
    stripped !== "" && !stripped.startsWith("/") && !stripped.startsWith("?")
      ? `/${stripped}`
      : stripped;

  const node: MutableRouteNode = {
    name: definition.name,
    path: normalizedPath,
    absolute,
    children: [],
    parent,
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
