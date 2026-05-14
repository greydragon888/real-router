import { assertInInjectionContext } from "@angular/core";
import { getPluginApi } from "@real-router/core/api";
import { getRouteUtils } from "@real-router/route-utils";

import { injectRouter } from "./injectRouter";

import type { RouteUtils } from "@real-router/route-utils";

export function injectRouteUtils(): RouteUtils {
  assertInInjectionContext(injectRouteUtils);

  const router = injectRouter();

  return getRouteUtils(getPluginApi(router).getTree());
}
