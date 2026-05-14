import { getPluginApi } from "@real-router/core/api";
import { getRouteUtils } from "@real-router/route-utils";

import { useRouter } from "./useRouter";

import type { Router } from "@real-router/core";
import type { RouteUtils } from "@real-router/route-utils";

// §8.1 audit fix (MED) — cache the `RouteUtils` per (router, tree) so N
// components calling `useRouteUtils()` against the same router share ONE
// chain through `getPluginApi(router).getTree()` + `getRouteUtils(tree)`.
//
// Why two-level (router + tree) and not just router:
//   `getRouteUtils` is WeakMap-cached by tree root, BUT a RouteUtils
//   instance is built FROM the tree at construction time — its internal
//   `getChain`/`getSiblings` caches are pre-computed Object.freeze'd arrays
//   (see `@real-router/route-utils` CLAUDE.md). If the router replaces its
//   tree (e.g. `routesApi.replace([...])`), the old RouteUtils is stale.
//   Caching only by router would serve the stale instance.
//
// Storing `{ tree, utils }` per router lets us detect tree replacement and
// recompute. In the steady state (no tree mutation), this is a cheap
// reference compare; under tree replacement, the cache self-heals on the
// next call.
//
// WeakMap keys on the router — entries are released automatically when the
// router is garbage-collected.
interface CachedEntry {
  tree: unknown;
  utils: RouteUtils;
}

const routeUtilsCache = new WeakMap<Router, CachedEntry>();

export const useRouteUtils = (): RouteUtils => {
  const router = useRouter();
  const tree = getPluginApi(router).getTree();

  const cached = routeUtilsCache.get(router);

  if (cached?.tree === tree) {
    return cached.utils;
  }

  const utils = getRouteUtils(tree);

  routeUtilsCache.set(router, { tree, utils });

  return utils;
};
