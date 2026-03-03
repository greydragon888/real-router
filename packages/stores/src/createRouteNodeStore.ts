import { computeSnapshot } from "./computeSnapshot.js";
import { createBaseStore } from "./createBaseStore.js";
import { getCachedShouldUpdate } from "./shouldUpdateCache.js";

import type { RouteNodeSnapshot, RouterStore } from "./types.js";
import type { Router } from "@real-router/core";

export function createRouteNodeStore(
  router: Router,
  nodeName: string,
): RouterStore<RouteNodeSnapshot> {
  const initialSnapshot: RouteNodeSnapshot = {
    route: undefined,
    previousRoute: undefined,
  };
  const computedInitial = computeSnapshot(initialSnapshot, router, nodeName);

  const store = createBaseStore(computedInitial);
  const shouldUpdate = getCachedShouldUpdate(router, nodeName);

  const unsubscribe = router.subscribe((next) => {
    if (!shouldUpdate(next.route, next.previousRoute)) {
      return;
    }

    const newSnapshot = computeSnapshot(
      store.getSnapshot(),
      router,
      nodeName,
      next,
    );

    /* v8 ignore next 3 -- @preserve: dedup guard; shouldUpdateNode filters accurately so computeSnapshot always returns new ref */
    if (!Object.is(store.getSnapshot(), newSnapshot)) {
      store._update(newSnapshot);
    }
  });

  return {
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    destroy() {
      unsubscribe();
      store.destroy();
    },
  };
}
