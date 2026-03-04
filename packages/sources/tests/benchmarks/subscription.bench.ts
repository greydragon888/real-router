/**
 * Sources subscription benchmarks
 *
 * Tests the subscription lifecycle:
 * - subscribe/unsubscribe cycles (ACCUMULATION — add + remove fallback)
 * - getSnapshot hot path (NON-MUTATING — source outside bench)
 * - Full lifecycle: create → subscribe → destroy
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

// ============================================================================
// 1. Subscribe + unsubscribe cycles
// ============================================================================

// 1.1 subscribe + unsubscribe on routeSources (lazy-connection)
// Type: ACCUMULATION — subscribe + unsubscribe fallback
// Each cycle triggers router.subscribe() and router unsubscribe (lazy)
{
  const router = createTestRouter();
  const source = createRouteSource(router);

  bench("1.1 subscribe + unsubscribe on routeSources (lazy-connection)", () => {
    const listener = () => {};
    const unsub = source.subscribe(listener);

    unsub();
  }).gc("inner");

  source.destroy();
  router.stop();
}

// 1.2 subscribe + unsubscribe on routeNodeSources
// Type: ACCUMULATION — subscribe + unsubscribe fallback
{
  const router = createTestRouter();
  const source = createRouteNodeSource(router, "users");

  bench("1.2 subscribe + unsubscribe on routeNodeSources", () => {
    const listener = () => {};
    const unsub = source.subscribe(listener);

    unsub();
  }).gc("inner");

  source.destroy();
  router.stop();
}

// ============================================================================
// 2. getSnapshot (hot path)
// ============================================================================

// 2.1 getSnapshot on routeSources
// Type: NON-MUTATING — source and router outside
// This is the hottest path: called on every React render
{
  const router = createTestRouter();
  const source = createRouteSource(router);
  // Activate lazy-connection
  const unsub = source.subscribe(() => {});

  bench("2.1 getSnapshot on routeSources (hot path)", () => {
    do_not_optimize(source.getSnapshot());
  }).gc("inner");

  unsub();
  source.destroy();
  router.stop();
}

// 2.2 getSnapshot on routeNodeSources
// Type: NON-MUTATING
{
  const router = createTestRouter();
  const source = createRouteNodeSource(router, "");
  const unsub = source.subscribe(() => {});

  bench("2.2 getSnapshot on routeNodeSources (hot path)", () => {
    do_not_optimize(source.getSnapshot());
  }).gc("inner");

  unsub();
  source.destroy();
  router.stop();
}

// 2.3 getSnapshot on activeRouteSources
// Type: NON-MUTATING
{
  const router = createTestRouter();
  const source = createActiveRouteSource(router, "home");
  const unsub = source.subscribe(() => {});

  bench("2.3 getSnapshot on activeRouteSources (hot path)", () => {
    do_not_optimize(source.getSnapshot());
  }).gc("inner");

  unsub();
  source.destroy();
  router.stop();
}

// ============================================================================
// 3. Full lifecycle
// ============================================================================

// 3.1 routeNodeSources full lifecycle (create → subscribe → destroy)
// Type: ONE-TIME — measure full lifecycle cost
{
  const router = createTestRouter();

  bench(
    "3.1 routeNodeSources full lifecycle (create → subscribe → destroy)",
    () => {
      const source = createRouteNodeSource(router, "users");
      const unsub = source.subscribe(() => {});

      unsub();
      source.destroy();
    },
  ).gc("inner");

  router.stop();
}
