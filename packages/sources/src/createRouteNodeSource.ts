import { BaseSource } from "./BaseSource";
import { computeSnapshot } from "./computeSnapshot.js";
import { getCachedShouldUpdate } from "./shouldUpdateCache.js";

import type { RouteNodeSnapshot, RouterSource } from "./types.js";
import type { Router } from "@real-router/core";

/**
 * Creates a source scoped to a specific route node.
 *
 * Uses a lazy-connection pattern: the router subscription is created when the
 * first listener subscribes and removed when the last listener unsubscribes.
 * This is compatible with React's useSyncExternalStore and Strict Mode.
 */
export function createRouteNodeSource(
  router: Router,
  nodeName: string,
): RouterSource<RouteNodeSnapshot> {
  let routerUnsubscribe: (() => void) | null = null;

  const shouldUpdate = getCachedShouldUpdate(router, nodeName);

  const initialSnapshot: RouteNodeSnapshot = {
    route: undefined,
    previousRoute: undefined,
  };

  const disconnect = (): void => {
    const unsub = routerUnsubscribe;

    routerUnsubscribe = null;
    unsub?.();
  };

  const source = new BaseSource<RouteNodeSnapshot>(
    computeSnapshot(initialSnapshot, router, nodeName),
    {
      onFirstSubscribe: () => {
        // Reconcile snapshot with current router state before connecting.
        // Covers reconnection after Activity hide/show cycles where the
        // source was disconnected and missed navigation events.
        const reconciled = computeSnapshot(
          source.getSnapshot(),
          router,
          nodeName,
        );

        if (!Object.is(reconciled, source.getSnapshot())) {
          source.updateSnapshot(reconciled);
        }

        // Connect to router on first subscription
        routerUnsubscribe = router.subscribe((next) => {
          if (!shouldUpdate(next.route, next.previousRoute)) {
            return;
          }

          const newSnapshot = computeSnapshot(
            source.getSnapshot(),
            router,
            nodeName,
            next,
          );

          if (!Object.is(source.getSnapshot(), newSnapshot)) {
            source.updateSnapshot(newSnapshot);
          }
        });
      },
      onLastUnsubscribe: disconnect,
      onDestroy: disconnect,
    },
  );

  return source;
}
