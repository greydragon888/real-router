/**
 * Sources notification benchmarks
 *
 * Tests how sources handle navigation events:
 * - routeSources: every navigation triggers notification
 * - routeNodeSources: shouldUpdate filter + computeSnapshot + Object.is dedup
 * - activeRouteSources: areRoutesRelated filter + isActiveRoute + boolean dedup
 *
 * Operation type: NON-MUTATING — navigate doesn't mutate router
 */

import { createRouter } from "@real-router/core";
import { bench } from "mitata";

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
// 1. routeSources notification
// ============================================================================

// 1.1 routeSources notification on navigation (1 listener)
// Type: NON-MUTATING — navigate doesn't mutate router
// Measures: router.subscribe callback → snapshot update → listener notification
{
  const router = createTestRouter();
  const source = createRouteSource(router);

  source.subscribe(() => {});

  bench("1.1 routeSources notification on navigation (1 listener)", () => {
    for (let i = 0; i < 1000; i++) {
      void router.navigate(NAV_ROUTES[i % 2]);
    }
  }).gc("inner");

  source.destroy();
  router.stop();
}

// ============================================================================
// 2. routeNodeSources notification
// ============================================================================

// 2.1 routeNodeSources notification — related node
// Type: NON-MUTATING
// Measures: shouldUpdate filter (pass) → computeSnapshot → Object.is check → notify
{
  const router = createTestRouter();
  // Subscribe to root node "" — always active, always notified
  const source = createRouteNodeSource(router, "");

  source.subscribe(() => {});

  bench(
    "2.1 routeNodeSources notification — related node (1000 navigations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        void router.navigate(NAV_ROUTES[i % 2]);
      }
    },
  ).gc("inner");

  source.destroy();
  router.stop();
}

// 2.2 routeNodeSources dedup — unrelated node (shouldUpdate filter)
// Type: NON-MUTATING
// Measures: shouldUpdate returns false → no snapshot computation, no notify
// Navigation between "home" and "about" — "users" node is unrelated
{
  const router = createTestRouter();
  const source = createRouteNodeSource(router, "users");

  source.subscribe(() => {});

  bench(
    "2.2 routeNodeSources dedup — unrelated node skipped (1000 navigations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        void router.navigate(NAV_ROUTES[i % 2]);
      }
    },
  ).gc("inner");

  source.destroy();
  router.stop();
}

// ============================================================================
// 3. activeRouteSources notification
// ============================================================================

// 3.1 activeRouteSources notification — related route
// Type: NON-MUTATING
// Measures: areRoutesRelated (pass) → isActiveRoute → boolean dedup → notify
{
  const router = createTestRouter();
  // Track "home" — navigations between home/about toggle active state
  const source = createActiveRouteSource(router, "home");

  source.subscribe(() => {});

  bench(
    "3.1 activeRouteSources notification — related route (1000 navigations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        void router.navigate(NAV_ROUTES[i % 2]);
      }
    },
  ).gc("inner");

  source.destroy();
  router.stop();
}

// 3.2 activeRouteSources dedup — unrelated route (areRoutesRelated filter)
// Type: NON-MUTATING
// Measures: areRoutesRelated returns false for both new and prev → skip
// Track "users.view" but navigate between home/about only
{
  const router = createTestRouter();
  const source = createActiveRouteSource(router, "users.view");

  source.subscribe(() => {});

  bench(
    "3.2 activeRouteSources dedup — unrelated route skipped (1000 navigations)",
    () => {
      for (let i = 0; i < 1000; i++) {
        void router.navigate(NAV_ROUTES[i % 2]);
      }
    },
  ).gc("inner");

  source.destroy();
  router.stop();
}
