/**
 * Store creation benchmarks
 *
 * Tests factory cost for each store type:
 * - createRouteStore: lazy-connection pattern (no router.subscribe until first listener)
 * - createRouteNodeStore: eager subscription + shouldUpdateCache + computeSnapshot
 * - createActiveRouteStore: eager subscription + areRoutesRelated + isActiveRoute
 *
 * Operation type: ONE-TIME — create + destroy fallback
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

// JIT Warmup: Pre-warm store creation paths
{
  const warmupRouter = createTestRouter();

  for (let i = 0; i < 100; i++) {
    const s1 = createRouteStore(warmupRouter);

    s1.destroy();

    const s2 = createRouteNodeStore(warmupRouter, "users");

    s2.destroy();

    const s3 = createActiveRouteStore(warmupRouter, "home");

    s3.destroy();
  }

  warmupRouter.stop();
}

// ============================================================================
// 1. createRouteStore factory cost
// ============================================================================

// 1.1 createRouteStore factory cost
// Type: ONE-TIME — create + destroy fallback
{
  const router = createTestRouter();

  bench("1.1 createRouteStore factory cost", () => {
    const store = createRouteStore(router);

    store.destroy();
  }).gc("inner");

  router.stop();
}

// ============================================================================
// 2. createRouteNodeStore factory cost
// ============================================================================

// 2.1 createRouteNodeStore factory cost (cache miss)
// Uses fresh router each iteration to force WeakMap cache miss
bench("2.1 createRouteNodeStore factory cost (cache miss)", () => {
  const router = createTestRouter();

  const store = createRouteNodeStore(router, "users");

  do_not_optimize(store.getSnapshot());
  store.destroy();

  router.stop();
}).gc("inner");

// 2.2 createRouteNodeStore factory cost (cache hit)
// Same router reused — WeakMap cache hit on shouldUpdateNode
{
  const router = createTestRouter();

  // Prime the cache
  const primer = createRouteNodeStore(router, "users");

  primer.destroy();

  bench("2.2 createRouteNodeStore factory cost (cache hit)", () => {
    const store = createRouteNodeStore(router, "users");

    store.destroy();
  }).gc("inner");

  router.stop();
}

// ============================================================================
// 3. createActiveRouteStore factory cost
// ============================================================================

// 3.1 createActiveRouteStore factory cost (default options)
{
  const router = createTestRouter();

  bench("3.1 createActiveRouteStore factory cost", () => {
    const store = createActiveRouteStore(router, "home", undefined, {
      strict: false,
      ignoreQueryParams: true,
    });

    store.destroy();
  }).gc("inner");

  router.stop();
}

// 3.2 createActiveRouteStore factory cost (strict mode)
{
  const router = createTestRouter();

  bench("3.2 createActiveRouteStore factory cost (strict mode)", () => {
    const store = createActiveRouteStore(router, "home", undefined, {
      strict: true,
      ignoreQueryParams: false,
    });

    store.destroy();
  }).gc("inner");

  router.stop();
}
