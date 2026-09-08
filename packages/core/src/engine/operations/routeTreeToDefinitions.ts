/**
 * RouteTree to RouteDefinition Converter.
 *
 * Converts a RouteTree back to an array of RouteDefinition objects.
 * Used for serialization and router cloning.
 *
 * @module operations/routeTreeToDefinitions
 */

import { putField } from "../../utils/ingest";

import type { RouteDefinition, RouteTree } from "../types";

/**
 * Converts a single RouteTree node to a RouteDefinition.
 *
 * If the node has absolute=true, the path is prefixed with '~'
 * to reconstruct the original definition format.
 *
 * @param node - RouteTree node to convert
 * @returns RouteDefinition with name, path, and optional children
 */
export function nodeToDefinition(node: RouteTree): RouteDefinition {
  // Reconstruct absolute path marker if needed
  const path = node.absolute ? `~${node.path}` : node.path;

  const def: RouteDefinition = {
    name: node.name,
    path,
  };

  if (node.children.size > 0) {
    // ⚑ `putField`, the same write rule the registration walk carries
    // (#1852 / #2139): `def` is a literal with `name` and `path` on it, so
    // `children` has no own slot here and a plain assignment walks the
    // prototype into an ambient accessor.
    putField(
      def as unknown as Record<string, unknown>,
      "children",
      Array.from(node.children.values(), nodeToDefinition),
    );
  }

  return def;
}

/**
 * Converts a RouteTree back to an array of RouteDefinition objects.
 *
 * This is the inverse of createRouteTree - it extracts the minimal
 * definition data (name, path, children) from the computed tree.
 *
 * Note: Extra properties stored in RouteDefinition (like canActivate,
 * forwardTo, encodeParams, etc.) are NOT preserved in RouteTree,
 * so they won't be present in the output.
 *
 * @example
 * ```ts
 * const tree = createRouteTree("", "", [
 *   { name: "users", path: "/users", children: [
 *     { name: "profile", path: "/:id" }
 *   ]}
 * ]);
 *
 * const definitions = routeTreeToDefinitions(tree);
 * // [{ name: "users", path: "/users", children: [{ name: "profile", path: "/:id" }] }]
 * ```
 *
 * @param tree - RouteTree to convert
 * @returns Array of RouteDefinition objects (top-level routes only)
 */
export function routeTreeToDefinitions(tree: RouteTree): RouteDefinition[] {
  return Array.from(tree.children.values(), nodeToDefinition);
}
