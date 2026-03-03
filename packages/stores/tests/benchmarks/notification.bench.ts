/**
 * Store notification benchmarks
 *
 * Tests how stores handle navigation events:
 * - routeStore: every navigation triggers notification
 * - routeNodeStore: shouldUpdate filter + computeSnapshot + Object.is dedup
 * - activeRouteStore: areRoutesRelated filter + isActiveRoute + boolean dedup
 *
 * Operation type: NON-MUTATING — navigate doesn't mutate router
 */

import { createRouter } from "@real-router/core";
import { bench } from "mitata";

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
// 1. routeStore notification
// ============================================================================

// 1.1 routeStore notification on navigation (1 listener)
// Type: NON-MUTATING — navigate doesn't mutate router
// Measures: router.subscribe callback → snapshot update → listener notification
{
  const router = createTestRouter();
  const store = createRouteStore(router);

  store.subscribe(() => {});

  bench("1.1 routeStore notification on navigation (1 listener)", () => {
    for (let i = 0; i < 1000; i++) {
      void router.navigate(NAV_ROUTES[i % 2]);
    }
  }).gc("inner");

  store.destroy();
  router.stop();
}

// ============================================================================
// 2. routeNodeStore notification
// ============================================================================

// 2.1 routeNodeStore notification — related node
// Type: NON-MUTATING
// Measures: shouldUpdate filter (pass) → computeSnapshot → Object.is check → notify
{
  const router = createTestRouter();
  // Subscribe to root node "" — always active, always notified
  const store = createRouteNodeStore(router, "");

  store.subscribe(() => {});

  bench(
    "2.1 routeNodeStore notification — related node (1000 navigations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        void router.navigate(NAV_ROUTES[i % 2]);
      }
    },
  ).gc("inner");

  store.destroy();
  router.stop();
}

// 2.2 routeNodeStore dedup — unrelated node (shouldUpdate filter)
// Type: NON-MUTATING
// Measures: shouldUpdate returns false → no snapshot computation, no notify
// Navigation between "home" and "about" — "users" node is unrelated
{
  const router = createTestRouter();
  const store = createRouteNodeStore(router, "users");

  store.subscribe(() => {});

  bench(
    "2.2 routeNodeStore dedup — unrelated node skipped (1000 navigations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        void router.navigate(NAV_ROUTES[i % 2]);
      }
    },
  ).gc("inner");

  store.destroy();
  router.stop();
}

// ============================================================================
// 3. activeRouteStore notification
// ============================================================================

// 3.1 activeRouteStore notification — related route
// Type: NON-MUTATING
// Measures: areRoutesRelated (pass) → isActiveRoute → boolean dedup → notify
{
  const router = createTestRouter();
  // Track "home" — navigations between home/about toggle active state
  const store = createActiveRouteStore(router, "home");

  store.subscribe(() => {});

  bench(
    "3.1 activeRouteStore notification — related route (1000 navigations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        void router.navigate(NAV_ROUTES[i % 2]);
      }
    },
  ).gc("inner");

  store.destroy();
  router.stop();
}

// 3.2 activeRouteStore dedup — unrelated route (areRoutesRelated filter)
// Type: NON-MUTATING
// Measures: areRoutesRelated returns false for both new and prev → skip
// Track "users.view" but navigate between home/about only
{
  const router = createTestRouter();
  const store = createActiveRouteStore(router, "users.view");

  store.subscribe(() => {});

  bench(
    "3.2 activeRouteStore dedup — unrelated route skipped (1000 navigations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        void router.navigate(NAV_ROUTES[i % 2]);
      }
    },
  ).gc("inner");

  store.destroy();
  router.stop();
}
