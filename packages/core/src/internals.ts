// packages/real-router/modules/internals.ts

/**
 * Typed accessors for internal router storage.
 *
 * Router uses Symbols to store internal state that shouldn't appear in Object.keys().
 * These accessors provide type-safe access without scattered type casts.
 *
 * @internal
 */

import {
  ROOT_TREE_SYMBOL,
  RESOLVED_FORWARD_MAP_SYMBOL,
  CONFIG_SYMBOL,
} from "./constants";

import type { Router, DefaultDependencies, Config } from "@real-router/types";
import type { RouteTree } from "route-tree";

/**
 * Internal storage shape for router.
 * These properties are stored using Symbols for encapsulation.
 */
interface RouterInternals {
  [ROOT_TREE_SYMBOL]: RouteTree;
  [RESOLVED_FORWARD_MAP_SYMBOL]: Record<string, string>;
  [CONFIG_SYMBOL]: Config;
}

/**
 * Type for router with internal storage exposed.
 */
type RouterWithInternals<Dependencies extends DefaultDependencies> =
  Router<Dependencies> & RouterInternals;

// =============================================================================
// Route Tree Accessors
// =============================================================================

/**
 * Gets the route tree from router internal storage.
 * Tree is always initialized in createRouter, so this never returns undefined.
 *
 * @param router - Router instance
 * @returns Route tree
 */
export function getRouteTree<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
): RouteTree {
  return (router as RouterWithInternals<Dependencies>)[ROOT_TREE_SYMBOL];
}

/**
 * Sets the route tree in router internal storage.
 *
 * @param router - Router instance
 * @param tree - New route tree
 */
export function setRouteTree<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
  tree: RouteTree,
): void {
  (router as RouterWithInternals<Dependencies>)[ROOT_TREE_SYMBOL] = tree;
}

// =============================================================================
// Resolved Forward Map Accessors
// =============================================================================

/**
 * Gets the resolved forward map from router internal storage.
 * Map is always initialized in createRouter, so this never returns undefined.
 *
 * @param router - Router instance
 * @returns Resolved forward map (route name → final destination)
 */
export function getResolvedForwardMap<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
): Record<string, string> {
  return (router as RouterWithInternals<Dependencies>)[
    RESOLVED_FORWARD_MAP_SYMBOL
  ];
}

/**
 * Sets the resolved forward map in router internal storage.
 *
 * @param router - Router instance
 * @param map - New resolved forward map
 */
export function setResolvedForwardMap<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
  map: Record<string, string>,
): void {
  (router as RouterWithInternals<Dependencies>)[RESOLVED_FORWARD_MAP_SYMBOL] =
    map;
}

// =============================================================================
// Config Accessors
// =============================================================================

/**
 * Gets the router configuration from internal storage.
 * Config is always initialized in createRouter, so this never returns undefined.
 *
 * @param router - Router instance
 * @returns Router configuration (decoders, encoders, defaultParams, forwardMap)
 */
export function getConfig<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
): Config {
  return (router as RouterWithInternals<Dependencies>)[CONFIG_SYMBOL];
}

/**
 * Sets the router configuration in internal storage.
 *
 * @param router - Router instance
 * @param config - New configuration
 */
export function setConfig<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
  config: Config,
): void {
  (router as RouterWithInternals<Dependencies>)[CONFIG_SYMBOL] = config;
}
