import { RouteUtils } from "./RouteUtils.js";

import type { RouteTree } from "route-tree";

const cache = new WeakMap<RouteTree, RouteUtils>();

export function getRouteUtils(root: RouteTree): RouteUtils {
  let utils = cache.get(root);

  if (utils === undefined) {
    utils = new RouteUtils(root);
    cache.set(root, utils);
  }

  return utils;
}
