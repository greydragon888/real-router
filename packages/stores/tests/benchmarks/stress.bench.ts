/**
 * Store stress benchmarks
 *
 * Tests extreme conditions:
 * - Fan-out: many listeners on one store
 * - Many stores: 50 routeNodeStores / activeRouteStores on one router
 * - Rapid lifecycle: subscribe/unsubscribe churn (lazy-connection)
 * - Cache performance: WeakMap cache with repeated (router, nodeName) pairs
 */

import { createRouter } from "@real-router/core";
import { bench, do_not_optimize } from "mitata";

import { createActiveRouteStore } from "../../src/createActiveRouteStore.js";
import { createRouteNodeStore } from "../../src/createRouteNodeStore.js";
import { createRouteStore } from "../../src/createRouteStore.js";

import type { Route, Router } from "@real-router/core";

// ============================================================================
// Helpers
// ============================================================================

const ROUTES: Route[] = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "view", path: "/:id" }],
  },
  { name: "about", path: "/about" },
  { name: "admin", path: "/admin" },
];

function createTestRouter(): Router {
  const router = createRouter(ROUTES, { defaultRoute: "home" });

  void router.start("/");

  return router;
}

const NAV_ROUTES = ["about", "home"];

// ============================================================================
// 1. Fan-out: many listeners
// ============================================================================

// 1.1 routeStore with 100 listeners — notification fan-out
// Type: NON-MUTATING — navigate doesn't mutate router
// Measures: 1 navigation → 100 listener callbacks
{
  const router = createTestRouter();
  const store = createRouteStore(router);

  for (let i = 0; i < 100; i++) {
    store.subscribe(() => {});
  }

  bench("1.1 routeStore with 100 listeners — notification fan-out", () => {
    for (let i = 0; i < 1000; i++) {
      void router.navigate(NAV_ROUTES[i % 2]);
    }
  }).gc("inner");

  store.destroy();
  router.stop();
}

// ============================================================================
// 2. Many stores on one router
// ============================================================================

// 2.1 50 routeNodeStores on one router — navigation with filtering
// Type: NON-MUTATING
// Measures: 1 navigation → 50 shouldUpdate checks → filtered notify
{
  const router = createTestRouter();

  const stores = Array.from({ length: 50 }, (_, i) =>
    createRouteNodeStore(router, i % 4 === 0 ? "" : `node${i}`),
  );

  for (const store of stores) {
    store.subscribe(() => {});
  }

  bench("2.1 50 routeNodeStores — navigation with filtering (1000 nav)", () => {
    for (let i = 0; i < 1000; i++) {
      void router.navigate(NAV_ROUTES[i % 2]);
    }
  }).gc("inner");

  for (const store of stores) {
    store.destroy();
  }

  router.stop();
}

// 2.2 50 activeRouteStores on one router — navigation with areRoutesRelated
// Type: NON-MUTATING
// Measures: 1 navigation → 50 areRoutesRelated checks → filtered notify
{
  const router = createTestRouter();

  const stores = Array.from({ length: 50 }, (_, i) =>
    createActiveRouteStore(router, i % 2 === 0 ? "home" : `route${i}`),
  );

  for (const store of stores) {
    store.subscribe(() => {});
  }

  bench(
    "2.2 50 activeRouteStores — navigation with areRoutesRelated (1000 nav)",
    () => {
      for (let i = 0; i < 1000; i++) {
        void router.navigate(NAV_ROUTES[i % 2]);
      }
    },
  ).gc("inner");

  for (const store of stores) {
    store.destroy();
  }

  router.stop();
}

// ============================================================================
// 3. Rapid lifecycle churn
// ============================================================================

// 3.1 Rapid subscribe/unsubscribe cycles on routeStore (lazy-connection churn)
// Type: ACCUMULATION — subscribe + unsubscribe fallback
// Measures: lazy connect → disconnect → reconnect → ... (1000 cycles)
{
  const router = createTestRouter();
  const store = createRouteStore(router);

  bench("3.1 1000 subscribe/unsubscribe cycles (lazy-connection churn)", () => {
    for (let i = 0; i < 1000; i++) {
      const unsub = store.subscribe(() => {});

      unsub();
    }
  }).gc("inner");

  store.destroy();
  router.stop();
}

// ============================================================================
// 4. WeakMap cache performance
// ============================================================================

// 4.1 1000 routeNodeStore creates with same (router, nodeName) — WeakMap cache hit
// Type: ONE-TIME — create + destroy fallback
// Measures: WeakMap.get → Map.get → cached shouldUpdate fn reuse
{
  const router = createTestRouter();

  // Prime the cache
  const primer = createRouteNodeStore(router, "users");

  primer.destroy();

  bench("4.1 1000 routeNodeStore creates — WeakMap cache hit", () => {
    for (let i = 0; i < 1000; i++) {
      const store = createRouteNodeStore(router, "users");

      do_not_optimize(store.getSnapshot());
      store.destroy();
    }
  }).gc("inner");

  router.stop();
}
