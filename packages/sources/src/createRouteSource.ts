import { BaseSource } from "./BaseSource";
import { catchUpSnapshot } from "./computeSnapshot.js";
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

  // The router state the snapshot was last computed against — by the router
  // listener on every announcement, by `reconcile` while disconnected. While it
  // is still the router's state, the snapshot is current.
  let computedFor = router.getState();

  const source = new BaseSource<RouteSnapshot>(
    {
      route: computedFor,
      previousRoute: undefined,
    },
    {
      // While this source has no listener it holds no router subscription
      // (onLastUnsubscribe below), so a navigation in that window is missed —
      // a `RouterProvider` under `<Activity>` hide → navigate → show reads
      // through this catch-up (#765, #2909).
      reconcile: (current) => {
        const state = router.getState();

        if (state === computedFor) {
          return current;
        }

        computedFor = state;

        return catchUpSnapshot(current, state);
      },
      onFirstSubscribe: () => {
        routerUnsubscribe = router.subscribe((next) => {
          // Read before recording `next.route`: core also calls this listener
          // for an announcement that began before the last unsubscribe, when a
          // read reconciles and records the router's state itself.
          const prev = source.getSnapshot();

          computedFor = next.route;

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
