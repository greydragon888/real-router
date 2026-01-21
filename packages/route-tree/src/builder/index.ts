// packages/route-tree/modules/builder/index.ts

/**
 * Route Tree Builder.
 *
 * Functions for creating route trees from definitions.
 *
 * @module builder
 */

export { createRouteTree, createRouteTreeBuilder } from "./createRouteTree";

export { DuplicateRouteError, InvalidRouteError } from "../validation/errors";

export type {
  PathBuildOptions,
  PathTestOptions,
  PathParser,
  RouteDefinition,
  RouteTree,
  TreeBuildOptions,
  RouteTreeBuilder,
} from "./types";
