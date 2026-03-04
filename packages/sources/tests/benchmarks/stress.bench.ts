/**
 * Sources stress benchmarks
 *
 * Tests extreme conditions:
 * - Fan-out: many listeners on one source
 * - Many sources: 50 routeNodeSources / activeRouteSources on one router
 * - Rapid lifecycle: subscribe/unsubscribe churn (lazy-connection)
 * - Cache performance: WeakMap cache with repeated (router, nodeName) pairs
 */

import { createRouter } from "@real-router/core";
import { bench, do_not_optimize } from "mitata";

import {
  createActiveRouteSource,
  createRouteNodeSource,
  createRouteSource,
} from "../../src";

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

// 1.1 routeSources with 100 listeners — notification fan-out
// Type: NON-MUTATING — navigate doesn't mutate router
// Measures: 1 navigation → 100 listener callbacks
{
  const router = createTestRouter();
  const source = createRouteSource(router);

  for (let i = 0; i < 100; i++) {
    source.subscribe(() => {});
  }

  bench("1.1 routeSources with 100 listeners — notification fan-out", () => {
    for (let i = 0; i < 1000; i++) {
      void router.navigate(NAV_ROUTES[i % 2]);
    }
  }).gc("inner");

  source.destroy();
  router.stop();
}

// ============================================================================
// 2. Many sources on one router
// ============================================================================

// 2.1 50 routeNodeSources on one router — navigation with filtering
// Type: NON-MUTATING
// Measures: 1 navigation → 50 shouldUpdate checks → filtered notify
{
  const router = createTestRouter();

  const sources = Array.from({ length: 50 }, (_, i) =>
    createRouteNodeSource(router, i % 4 === 0 ? "" : `node${i}`),
  );

  for (const source of sources) {
    source.subscribe(() => {});
  }

  bench(
    "2.1 50 routeNodeSources — navigation with filtering (1000 nav)",
    () => {
      for (let i = 0; i < 1000; i++) {
        void router.navigate(NAV_ROUTES[i % 2]);
      }
    },
  ).gc("inner");

  for (const source of sources) {
    source.destroy();
  }

  router.stop();
}

// 2.2 50 activeRouteSources on one router — navigation with areRoutesRelated
// Type: NON-MUTATING
// Measures: 1 navigation → 50 areRoutesRelated checks → filtered notify
{
  const router = createTestRouter();

  const sources = Array.from({ length: 50 }, (_, i) =>
    createActiveRouteSource(router, i % 2 === 0 ? "home" : `route${i}`),
  );

  for (const source of sources) {
    source.subscribe(() => {});
  }

  bench(
    "2.2 50 activeRouteSources — navigation with areRoutesRelated (1000 nav)",
    () => {
      for (let i = 0; i < 1000; i++) {
        void router.navigate(NAV_ROUTES[i % 2]);
      }
    },
  ).gc("inner");

  for (const source of sources) {
    source.destroy();
  }

  router.stop();
}

// ============================================================================
// 3. Rapid lifecycle churn
// ============================================================================

// 3.1 Rapid subscribe/unsubscribe cycles on routeSources (lazy-connection churn)
// Type: ACCUMULATION — subscribe + unsubscribe fallback
// Measures: lazy connect → disconnect → reconnect → ... (1000 cycles)
{
  const router = createTestRouter();
  const source = createRouteSource(router);

  bench("3.1 1000 subscribe/unsubscribe cycles (lazy-connection churn)", () => {
    for (let i = 0; i < 1000; i++) {
      const unsub = source.subscribe(() => {});

      unsub();
    }
  }).gc("inner");

  source.destroy();
  router.stop();
}

// ============================================================================
// 4. WeakMap cache performance
// ============================================================================

// 4.1 1000 routeNodeSources creates with same (router, nodeName) — WeakMap cache hit
// Type: ONE-TIME — create + destroy fallback
// Measures: WeakMap.get → Map.get → cached shouldUpdate fn reuse
{
  const router = createTestRouter();

  // Prime the cache
  const primer = createRouteNodeSource(router, "users");

  primer.destroy();

  bench("4.1 1000 routeNodeSources creates — WeakMap cache hit", () => {
    for (let i = 0; i < 1000; i++) {
      const source = createRouteNodeSource(router, "users");

      do_not_optimize(source.getSnapshot());
      source.destroy();
    }
  }).gc("inner");

  router.stop();
}
