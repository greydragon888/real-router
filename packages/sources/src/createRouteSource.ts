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
        // Reconcile the route with the current router state before connecting.
        // While this source had zero listeners it was disconnected
        // (onLastUnsubscribe below), so a navigation in that window was missed —
        // the just-added listener would otherwise observe a stale route (#765).
        // BaseSource registered the listener before this callback, so the
        // updateSnapshot below reaches it.
        //
        // Emit ONLY when the route actually changed: a hide/show (Activity)
        // cycle with no navigation in between must not fire a spurious
        // re-render, and its still-valid `previousRoute` must survive. When a
        // navigation WAS caught up, `previousRoute` resets to `undefined`: the
        // catch-up is a snap to the current state, not an observed navigation,
        // and the true previous route cannot be reconstructed outside a live
        // subscribe payload (parity of intent with createRouteNodeSource, whose
        // reconnect reconcile likewise drops previousRoute on catch-up).
        const current = source.getSnapshot();
        const reconciledRoute = stabilizeState(
          current.route,
          router.getState(),
        );

        if (reconciledRoute !== current.route) {
          source.updateSnapshot({
            route: reconciledRoute,
            previousRoute: undefined,
          });
        }

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
