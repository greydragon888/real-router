import { areRoutesRelated } from "@real-router/route-utils";

import { BaseSource } from "./BaseSource";

import type { ActiveRouteSourceOptions, RouterSource } from "./types.js";
import type { Params, Router } from "@real-router/core";

export function createActiveRouteSource(
  router: Router,
  routeName: string,
  params?: Params,
  options?: ActiveRouteSourceOptions,
): RouterSource<boolean> {
  const strict = options?.strict ?? false;
  const ignoreQueryParams = options?.ignoreQueryParams ?? true;

  const initialValue = router.isActiveRoute(
    routeName,
    params,
    strict,
    ignoreQueryParams,
  );

  const source = new BaseSource(initialValue, {
    onDestroy: () => {
      unsubscribe();
    },
  });

  // Eager connection: subscribe to router immediately
  const unsubscribe = router.subscribe((next) => {
    const isNewRelated = areRoutesRelated(routeName, next.route.name);
    const isPrevRelated =
      next.previousRoute &&
      areRoutesRelated(routeName, next.previousRoute.name);

    if (!isNewRelated && !isPrevRelated) {
      return;
    }

    // If new route is not related, we know the route is inactive —
    // avoid calling isActiveRoute for the optimization
    const newValue = isNewRelated
      ? router.isActiveRoute(routeName, params, strict, ignoreQueryParams)
      : false;

    if (!Object.is(source.getSnapshot(), newValue)) {
      source.updateSnapshot(newValue);
    }
  });

  return source;
}
