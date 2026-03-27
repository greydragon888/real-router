import { BaseSource } from "./BaseSource";
import { stabilizeState } from "./stabilizeState.js";

import type { RouteSnapshot, RouterSource } from "./types.js";
import type { Router } from "@real-router/core";

/**
 * Creates a source for the full route state.
 *
 * Uses a lazy-connection pattern: the router subscription is created when the
 * first listener subscribes and removed when the last listener unsubscribes.
 * This is compatible with React's useSyncExternalStore and Strict Mode.
 */
export function createRouteSource(router: Router): RouterSource<RouteSnapshot> {
  let routerUnsubscribe: (() => void) | null = null;

  const disconnect = (): void => {
    const unsub = routerUnsubscribe;

    routerUnsubscribe = null;
    unsub?.();
  };

  const source = new BaseSource<RouteSnapshot>(
    {
      route: router.getState(),
      previousRoute: undefined,
    },
    {
      onFirstSubscribe: () => {
        routerUnsubscribe = router.subscribe((next) => {
          const prev = source.getSnapshot();
          const newRoute = stabilizeState(prev.route, next.route);
          const newPreviousRoute = stabilizeState(
            prev.previousRoute,
            next.previousRoute,
          );

          if (
            newRoute !== prev.route ||
            newPreviousRoute !== prev.previousRoute
          ) {
            source.updateSnapshot({
              route: newRoute,
              previousRoute: newPreviousRoute,
            });
          }
        });
      },
      onLastUnsubscribe: disconnect,
      onDestroy: disconnect,
    },
  );

  return source;
}
