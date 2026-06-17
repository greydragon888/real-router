// packages/route-tree/modules/builder/index.ts

/**
 * Route Tree Builder.
 *
 * Functions for creating route trees from definitions.
 *
 * @module builder
 */

export { createRouteTree, createRouteTreeBuilder } from "./createRouteTree";

export type {
  RouteDefinition,
  RouteTree,
  TreeBuildOptions,
  RouteTreeBuilder,
} from "./types";
