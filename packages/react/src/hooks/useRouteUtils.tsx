// packages/react/modules/hooks/useRouteUtils.tsx

import { getPluginApi } from "@real-router/core/api";
import { getRouteUtils } from "@real-router/route-utils";

import { useRouter } from "./useRouter";

import type { RouteUtils } from "@real-router/route-utils";

/**
 * Returns a pre-computed {@link RouteUtils} instance for the current router.
 *
 * Internally retrieves the route tree via `getPluginApi` and delegates
 * to `getRouteUtils`, which caches instances per tree reference (WeakMap).
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
