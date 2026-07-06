// packages/route-node/modules/builder/createRouteTree.ts

/**
 * Route Tree Builder.
 *
 * Creates an immutable RouteTree from route definitions.
 *
 * @module builder/createRouteTree
 */

import { buildTree } from "./buildTree";
import { computeCaches } from "./computeCaches";

import type { RouteDefinition, RouteTree } from "../types";

/**
 * Creates an immutable RouteTree from route definitions.
 *
 * @param name - Root node name (typically empty string)
 * @param path - Root node path (typically empty string)
 * @param routes - Route definitions to add
 * @returns Immutable RouteTree
 *
 * @example
 * ```typescript
 * const tree = createRouteTree("", "", [
 *   { name: "users", path: "/users" },
 *   { name: "users.profile", path: "/:id" },
 * ]);
 * ```
 */
export function createRouteTree(
  name: string,
  path: string,
  routes: readonly RouteDefinition[],
): RouteTree {
  return computeCaches(buildTree(name, path, routes));
}
