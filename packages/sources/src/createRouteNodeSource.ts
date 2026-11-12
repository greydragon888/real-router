import { BaseSource } from "./BaseSource";
import {
  catchUpSnapshot,
  computeSnapshot,
  nodeRoute,
} from "./computeSnapshot.js";
import { noopDestroy } from "./internal/noopDestroy.js";

import type { RouteNodeSnapshot, RouterSource } from "./types.js";
import type { Router } from "@real-router/core";

const nodeSourceCache = new WeakMap<
  Router,
  Map<string, RouterSource<RouteNodeSnapshot>>
>();

/**
 * Creates a source scoped to a specific route node.
 *
 * **Per-router + per-nodeName cache:** repeated calls with the same
 * `(router, nodeName)` return the same shared instance. `N` consumers
 * calling `createRouteNodeSource(r, "users")` produce one router subscription
 * shared across all of them.
 *
 * Uses a lazy-connection pattern: the router subscription is created when the
 * first listener subscribes and removed when the last listener unsubscribes.
 * This is compatible with React's useSyncExternalStore and Strict Mode.
 *
 * `destroy()` on the returned source is a no-op — the shared instance lives
 * as long as the router itself (the WeakMap entry releases automatically on
 * router GC). Callers that need an isolated instance with working teardown
 * can use `buildRouteNodeSource` internally (not exported).
 */
export function createRouteNodeSource(
  router: Router,
  nodeName: string,
): RouterSource<RouteNodeSnapshot> {
  let perRouter = nodeSourceCache.get(router);

  if (!perRouter) {
    perRouter = new Map();
    nodeSourceCache.set(router, perRouter);
  }

  let cached = perRouter.get(nodeName);

  if (!cached) {
    const source = buildRouteNodeSource(router, nodeName);

    // Wrap with no-op destroy. The shared source lives with the router.
    cached = {
      subscribe: source.subscribe,
      getSnapshot: source.getSnapshot,
      destroy: noopDestroy,
    };
    perRouter.set(nodeName, cached);
  }

  return cached;
}

function buildRouteNodeSource(
  router: Router,
  nodeName: string,
): RouterSource<RouteNodeSnapshot> {
  let routerUnsubscribe: (() => void) | null = null;

  // Built once per cached source instance; safe — createRouteNodeSource is
  // itself per-(router, nodeName) cached, so shouldUpdate is called once.
  const shouldUpdate = router.shouldUpdateNode(nodeName);

  const initialSnapshot: RouteNodeSnapshot = {
    route: undefined,
    previousRoute: undefined,
  };

  const disconnect = (): void => {
    const unsub = routerUnsubscribe;

    routerUnsubscribe = null;
    unsub?.();
  };

  // The router state the snapshot was last computed against — by the router
  // listener once an announcement passes `shouldUpdate`, by `reconcile` while
  // disconnected. An announcement the filter drops leaves it behind, so the
  // next disconnected read recomputes.
  let computedFor = router.getState();

  const source = new BaseSource<RouteNodeSnapshot>(
    computeSnapshot(initialSnapshot, router, nodeName),
    {
      // Without listeners the source holds no router subscription, so a remount
      // after a navigation it did not see — an error boundary that showed its
      // fallback, an Activity hide/show — reads through this catch-up.
      reconcile: (current) => {
        const state = router.getState();

        if (state === computedFor) {
          return current;
        }

        computedFor = state;

        return catchUpSnapshot(current, nodeRoute(state, nodeName));
      },
      onFirstSubscribe: () => {
        routerUnsubscribe = router.subscribe((next) => {
          if (!shouldUpdate(next.route, next.previousRoute)) {
            return;
          }

          // One read, before recording `next.route`: core also calls this
          // listener for an announcement that began before the last
          // unsubscribe, when a read reconciles and records the router's state
          // itself.
          const current = source.getSnapshot();

          computedFor = next.route;

          const newSnapshot = computeSnapshot(current, router, nodeName, next);

          // computeSnapshot returns the snapshot held when both route and
          // previousRoute stabilize to it, as they do for the root node on a
          // same-path navigation without reload: no update is emitted, which
          // matters for signal-based adapters that re-run effects on every set.
          if (Object.is(current, newSnapshot)) {
            return;
          }

          source.updateSnapshot(newSnapshot);
        });
      },
      onLastUnsubscribe: disconnect,
    },
  );

  return source;
}
