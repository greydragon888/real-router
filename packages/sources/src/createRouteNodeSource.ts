import { BaseSource } from "./BaseSource";
import { computeSnapshot } from "./computeSnapshot.js";
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

          // computeSnapshot returns the SAME currentSnapshot reference when
          // both route and previousRoute stabilize to prev — guard against
          // emitting redundant updates to listeners (matters for signal-
          // based adapters that re-run effects on every set).
          /* v8 ignore next 3 -- @preserve: structurally unreachable after #605
             — reload navs always return fresh refs via stabilizeState, and
             within-node non-reload navs short-circuit at shouldUpdate. Guard
             kept for defensive correctness against future stabilizer changes. */
          if (Object.is(source.getSnapshot(), newSnapshot)) {
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
