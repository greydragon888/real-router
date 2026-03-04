import { computeSnapshot } from "./computeSnapshot.js";
import { createBaseSource } from "./createBaseSource";
import { getCachedShouldUpdate } from "./shouldUpdateCache.js";

import type { RouteNodeSnapshot, RouterSource } from "./types.js";
import type { Router } from "@real-router/types";

export function createRouteNodeSource(
  router: Router,
  nodeName: string,
): RouterSource<RouteNodeSnapshot> {
  const initialSnapshot: RouteNodeSnapshot = {
    route: undefined,
    previousRoute: undefined,
  };
  const computedInitial = computeSnapshot(initialSnapshot, router, nodeName);

  const source = createBaseSource(computedInitial);
  const shouldUpdate = getCachedShouldUpdate(router, nodeName);

  const unsubscribe = router.subscribe((next) => {
    if (!shouldUpdate(next.route, next.previousRoute)) {
      return;
    }

    const newSnapshot = computeSnapshot(
      source.getSnapshot(),
      router,
      nodeName,
      next,
    );

    /* v8 ignore next 3 -- @preserve: dedup guard; shouldUpdateNode filters accurately so computeSnapshot always returns new ref */
    if (!Object.is(source.getSnapshot(), newSnapshot)) {
      source._update(newSnapshot);
    }
  });

  return {
    subscribe: source.subscribe,
    getSnapshot: source.getSnapshot,
    destroy() {
      unsubscribe();
      source.destroy();
    },
  };
}
