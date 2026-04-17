import { createRouteNodeSource } from "@real-router/sources";

import type { Router } from "@real-router/core";
import type { RouteNodeSnapshot, RouterSource } from "@real-router/sources";

const cache = new WeakMap<
  Router,
  Map<string, RouterSource<RouteNodeSnapshot>>
>();

export function getOrCreateNodeSource(
  router: Router,
  nodeName: string,
): RouterSource<RouteNodeSnapshot> {
  let perRouter = cache.get(router);

  if (!perRouter) {
    perRouter = new Map();
    cache.set(router, perRouter);
  }

  let source = perRouter.get(nodeName);

  if (!source) {
    source = createRouteNodeSource(router, nodeName);
    perRouter.set(nodeName, source);
  }

  return source;
}
