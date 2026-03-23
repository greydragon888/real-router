import { getPluginApi } from "@real-router/core/api";
import { getRouteUtils } from "@real-router/route-utils";

import { useRouter } from "./useRouter.svelte";

import type { RouteUtils } from "@real-router/route-utils";

export const useRouteUtils = (): RouteUtils => {
  const router = useRouter();

  return getRouteUtils(getPluginApi(router).getTree());
};
