/**
 * Store subscription benchmarks
 *
 * Tests the subscription lifecycle:
 * - subscribe/unsubscribe cycles (ACCUMULATION — add + remove fallback)
 * - getSnapshot hot path (NON-MUTATING — store outside bench)
 * - Full lifecycle: create → subscribe → destroy
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

// ============================================================================
// 1. Subscribe + unsubscribe cycles
// ============================================================================

// 1.1 subscribe + unsubscribe on routeStore (lazy-connection)
// Type: ACCUMULATION — subscribe + unsubscribe fallback
// Each cycle triggers router.subscribe() and router unsubscribe (lazy)
{
  const router = createTestRouter();
  const store = createRouteStore(router);

  bench("1.1 subscribe + unsubscribe on routeStore (lazy-connection)", () => {
    const listener = () => {};
    const unsub = store.subscribe(listener);

    unsub();
  }).gc("inner");

  store.destroy();
  router.stop();
}

// 1.2 subscribe + unsubscribe on routeNodeStore
// Type: ACCUMULATION — subscribe + unsubscribe fallback
{
  const router = createTestRouter();
  const store = createRouteNodeStore(router, "users");

  bench("1.2 subscribe + unsubscribe on routeNodeStore", () => {
    const listener = () => {};
    const unsub = store.subscribe(listener);

    unsub();
  }).gc("inner");

  store.destroy();
  router.stop();
}

// ============================================================================
// 2. getSnapshot (hot path)
// ============================================================================

// 2.1 getSnapshot on routeStore
// Type: NON-MUTATING — store and router outside
// This is the hottest path: called on every React render
{
  const router = createTestRouter();
  const store = createRouteStore(router);
  // Activate lazy-connection
  const unsub = store.subscribe(() => {});

  bench("2.1 getSnapshot on routeStore (hot path)", () => {
    do_not_optimize(store.getSnapshot());
  }).gc("inner");

  unsub();
  store.destroy();
  router.stop();
}

// 2.2 getSnapshot on routeNodeStore
// Type: NON-MUTATING
{
  const router = createTestRouter();
  const store = createRouteNodeStore(router, "");
  const unsub = store.subscribe(() => {});

  bench("2.2 getSnapshot on routeNodeStore (hot path)", () => {
    do_not_optimize(store.getSnapshot());
  }).gc("inner");

  unsub();
  store.destroy();
  router.stop();
}

// 2.3 getSnapshot on activeRouteStore
// Type: NON-MUTATING
{
  const router = createTestRouter();
  const store = createActiveRouteStore(router, "home");
  const unsub = store.subscribe(() => {});

  bench("2.3 getSnapshot on activeRouteStore (hot path)", () => {
    do_not_optimize(store.getSnapshot());
  }).gc("inner");

  unsub();
  store.destroy();
  router.stop();
}

// ============================================================================
// 3. Full lifecycle
// ============================================================================

// 3.1 routeNodeStore full lifecycle (create → subscribe → destroy)
// Type: ONE-TIME — measure full lifecycle cost
{
  const router = createTestRouter();

  bench(
    "3.1 routeNodeStore full lifecycle (create → subscribe → destroy)",
    () => {
      const store = createRouteNodeStore(router, "users");
      const unsub = store.subscribe(() => {});

      unsub();
      store.destroy();
    },
  ).gc("inner");

  router.stop();
}
