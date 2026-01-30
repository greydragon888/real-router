// packages/route-node/modules/builder/createRouteTree.ts

/**
 * Route Tree Builder.
 *
 * Creates immutable RouteTree from route definitions.
 *
 * @module builder/createRouteTree
 */

import { buildTree } from "./buildTree";
import { computeCaches } from "./computeCaches";
import { sortTree } from "./sortTree";

import type {
  RouteDefinition,
  RouteTree,
  RouteTreeBuilder,
  TreeBuildOptions,
} from "../types";

// =============================================================================
// Builder Implementation
// =============================================================================

/**
 * Creates a RouteTreeBuilder for constructing route trees.
 *
 * @param name - Root node name (typically empty string)
 * @param path - Root node path (typically empty string)
 * @returns RouteTreeBuilder instance
 *
 * @example
 * ```typescript
 * const tree = createRouteTreeBuilder("", "")
 *   .add({ name: "users", path: "/users" })
 *   .add({ name: "users.profile", path: "/:id" })
 *   .build();
 * ```
 */
export function createRouteTreeBuilder(
  name: string,
  path: string,
): RouteTreeBuilder {
  const routes: RouteDefinition[] = [];

  return {
    add(route: RouteDefinition): RouteTreeBuilder {
      routes.push(route);

      return this;
    },

    addMany(newRoutes: readonly RouteDefinition[]): RouteTreeBuilder {
      routes.push(...newRoutes);

      return this;
    },

    build(options?: TreeBuildOptions): RouteTree {
      // Step 1: Build mutable tree structure
      const mutableTree = buildTree(name, path, routes);

      // Step 2: Sort all children (unless skipped)
      if (!options?.skipSort) {
        sortTree(mutableTree);
      }

      // Step 3: Compute all caches and optionally freeze
      const freeze = !options?.skipFreeze;

      return computeCaches(mutableTree, freeze);
    },
  };
}

// =============================================================================
// Convenience Function
// =============================================================================

/**
 * Creates a RouteTree directly from route definitions.
 *
 * Convenience wrapper around createRouteTreeBuilder().
 *
 * @param name - Root node name (typically empty string)
 * @param path - Root node path (typically empty string)
 * @param routes - Route definitions to add
 * @param options - Build options (e.g., skipSort, skipFreeze)
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
  options?: TreeBuildOptions,
): RouteTree {
  return createRouteTreeBuilder(name, path).addMany(routes).build(options);
}
