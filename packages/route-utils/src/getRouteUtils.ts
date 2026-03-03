import { RouteUtils } from "./RouteUtils.js";

import type { RouteTreeNode } from "./types.js";

const cache = new WeakMap<RouteTreeNode, RouteUtils>();

export function getRouteUtils(root: RouteTreeNode): RouteUtils {
  let utils = cache.get(root);

  if (utils === undefined) {
    utils = new RouteUtils(root);
    cache.set(root, utils);
  }

  return utils;
}
