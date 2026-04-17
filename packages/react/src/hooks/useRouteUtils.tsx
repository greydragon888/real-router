import { getPluginApi } from "@real-router/core/api";
import { getRouteUtils } from "@real-router/route-utils";

import { useRouter } from "./useRouter";

import type { Router } from "@real-router/core";
import type { RouteUtils } from "@real-router/route-utils";

const routeUtilsCache = new WeakMap<Router, RouteUtils>();

/**
 * Returns a pre-computed {@link RouteUtils} instance for the current router.
 *
 * Cached per router reference — no plugin/tree lookups on re-render.
 *
 * @returns RouteUtils instance with pre-computed chains and siblings
 *
 * @example
 * ```tsx
 * const utils = useRouteUtils();
 *
 * utils.getChain("users.profile");
 * // → ["users", "users.profile"]
 *
 * utils.getSiblings("users");
 * // → ["admin"]
 *
 * utils.isDescendantOf("users.profile", "users");
 * // → true
 * ```
 */
export const useRouteUtils = (): RouteUtils => {
  const router = useRouter();

  let utils = routeUtilsCache.get(router);

  if (!utils) {
    utils = getRouteUtils(getPluginApi(router).getTree());
    routeUtilsCache.set(router, utils);
  }

  return utils;
};
