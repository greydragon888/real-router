import { getPluginApi } from "@real-router/core/api";
import { getRouteUtils } from "@real-router/route-utils";

import { useRouter } from "./useRouter";

import type { RouteUtils } from "@real-router/route-utils";

/**
 * Returns a pre-computed {@link RouteUtils} instance for the current router.
 *
 * `getRouteUtils` is WeakMap-cached per `RouteTreeNode` inside
 * `@real-router/route-utils`, so the same router always returns the same
 * `RouteUtils` instance across renders — no local cache needed in the adapter.
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

  return getRouteUtils(getPluginApi(router).getTree());
};
