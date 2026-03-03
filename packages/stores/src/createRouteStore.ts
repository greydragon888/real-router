import { createBaseStore } from "./createBaseStore.js";

import type { RouteSnapshot, RouterStore } from "./types.js";
import type { Router } from "@real-router/core";

export function createRouteStore(router: Router): RouterStore<RouteSnapshot> {
  const initialSnapshot: RouteSnapshot = {
    route: router.getState(),
    previousRoute: undefined,
  };

  const store = createBaseStore(initialSnapshot);

  const unsubscribe = router.subscribe((next) => {
    store._update({
      route: next.route,
      previousRoute: next.previousRoute,
    });
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
