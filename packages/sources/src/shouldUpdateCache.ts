import type { Router, State } from "@real-router/core";

const shouldUpdateCache = new WeakMap<
  Router,
  Map<string, (toState: State, fromState?: State) => boolean>
>();

export function getCachedShouldUpdate(
  router: Router,
  nodeName: string,
): (toState: State, fromState?: State) => boolean {
  let routerCache = shouldUpdateCache.get(router);

  if (!routerCache) {
    routerCache = new Map();
    shouldUpdateCache.set(router, routerCache);
  }

  let fn = routerCache.get(nodeName);

  if (!fn) {
    fn = router.shouldUpdateNode(nodeName);
    routerCache.set(nodeName, fn);
  }

  return fn;
}
