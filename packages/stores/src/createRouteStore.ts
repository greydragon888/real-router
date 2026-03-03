import type { RouteSnapshot, RouterStore } from "./types.js";
import type { Router } from "@real-router/core";

/**
 * Creates a store for the full route state.
 *
 * Uses a lazy-connection pattern: the router subscription is created when the
 * first listener subscribes and removed when the last listener unsubscribes.
 * This is compatible with React's useSyncExternalStore and Strict Mode.
 */
export function createRouteStore(router: Router): RouterStore<RouteSnapshot> {
  let currentSnapshot: RouteSnapshot = {
    route: router.getState(),
    previousRoute: undefined,
  };

  let routerUnsubscribe: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function subscribe(listener: () => void): () => void {
    if (listeners.size === 0) {
      // Connect to router on first subscription
      routerUnsubscribe = router.subscribe((next) => {
        currentSnapshot = {
          route: next.route,
          previousRoute: next.previousRoute,
        };
        listeners.forEach((cb) => {
          cb();
        });
      });
    }

    listeners.add(listener);

    return () => {
      listeners.delete(listener);

      if (listeners.size === 0 && routerUnsubscribe) {
        routerUnsubscribe();
        routerUnsubscribe = null;
      }
    };
  }

  function getSnapshot(): RouteSnapshot {
    return currentSnapshot;
  }

  return {
    subscribe,
    getSnapshot,
    destroy(): void {
      if (routerUnsubscribe) {
        routerUnsubscribe();
        routerUnsubscribe = null;
      }

      listeners.clear();
    },
  };
}
