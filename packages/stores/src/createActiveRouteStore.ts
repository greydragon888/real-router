import { areRoutesRelated } from "@real-router/route-utils";

import { createBaseStore } from "./createBaseStore.js";

import type { ActiveRouteStoreOptions, RouterStore } from "./types.js";
import type { Params, Router } from "@real-router/core";

export function createActiveRouteStore(
  router: Router,
  routeName: string,
  params?: Params,
  options?: ActiveRouteStoreOptions,
): RouterStore<boolean> {
  const strict = options?.strict ?? false;
  const ignoreQueryParams = options?.ignoreQueryParams ?? true;

  const initialValue = router.isActiveRoute(
    routeName,
    params,
    strict,
    ignoreQueryParams,
  );

  const store = createBaseStore(initialValue);

  const unsubscribe = router.subscribe((next) => {
    const isNewRelated = areRoutesRelated(routeName, next.route.name);
    const isPrevRelated =
      next.previousRoute &&
      areRoutesRelated(routeName, next.previousRoute.name);

    if (!isNewRelated && !isPrevRelated) {
      return;
    }

    const newValue = router.isActiveRoute(
      routeName,
      params,
      strict,
      ignoreQueryParams,
    );

    if (!Object.is(store.getSnapshot(), newValue)) {
      store._update(newValue);
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
