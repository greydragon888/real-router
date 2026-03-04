/**
 * Sources creation benchmarks
 *
 * Tests factory cost for each source type:
 * - createRouteSources: lazy-connection pattern (no router.subscribe until first listener)
 * - createRouteNodeSources: eager subscription + shouldUpdateCache + computeSnapshot
 * - createActiveRouteSources: eager subscription + areRoutesRelated + isActiveRoute
 *
 * Operation type: ONE-TIME — create + destroy fallback
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

// JIT Warmup: Pre-warm source creation paths
{
  const warmupRouter = createTestRouter();

  for (let i = 0; i < 100; i++) {
    const s1 = createRouteSource(warmupRouter);

    s1.destroy();

    const s2 = createRouteNodeSource(warmupRouter, "users");

    s2.destroy();

    const s3 = createActiveRouteSource(warmupRouter, "home");

    s3.destroy();
  }

  warmupRouter.stop();
}

// ============================================================================
// 1. createRouteSources factory cost
// ============================================================================

// 1.1 createRouteSources factory cost
// Type: ONE-TIME — create + destroy fallback
{
  const router = createTestRouter();

  bench("1.1 createRouteSources factory cost", () => {
    const source = createRouteSource(router);

    source.destroy();
  }).gc("inner");

  router.stop();
}

// ============================================================================
// 2. createRouteNodeSources factory cost
// ============================================================================

// 2.1 createRouteNodeSources factory cost (cache miss)
// Same router, unique nodeName each iteration → Map miss in shouldUpdateCache
// Measures: WeakMap hit (same router) → Map miss (new nodeName) → shouldUpdateNode closure + Map.set
{
  const router = createTestRouter();
  let i = 0;

  bench("2.1 createRouteNodeSources factory cost (cache miss)", () => {
    const source = createRouteNodeSource(router, `node${i++}`);

    do_not_optimize(source.getSnapshot());
    source.destroy();
  }).gc("inner");

  router.stop();
}

// 2.2 createRouteNodeSources factory cost (cache hit)
// Same router reused — WeakMap cache hit on shouldUpdateNode
{
  const router = createTestRouter();

  // Prime the cache
  const primer = createRouteNodeSource(router, "users");

  primer.destroy();

  bench("2.2 createRouteNodeSources factory cost (cache hit)", () => {
    const source = createRouteNodeSource(router, "users");

    source.destroy();
  }).gc("inner");

  router.stop();
}

// ============================================================================
// 3. createActiveRouteSources factory cost
// ============================================================================

// 3.1 createActiveRouteSources factory cost (default options)
{
  const router = createTestRouter();

  bench("3.1 createActiveRouteSources factory cost", () => {
    const source = createActiveRouteSource(router, "home", undefined, {
      strict: false,
      ignoreQueryParams: true,
    });

    source.destroy();
  }).gc("inner");

  router.stop();
}

// 3.2 createActiveRouteSources factory cost (strict mode)
{
  const router = createTestRouter();

  bench("3.2 createActiveRouteSources factory cost (strict mode)", () => {
    const source = createActiveRouteSource(router, "home", undefined, {
      strict: true,
      ignoreQueryParams: false,
    });

    source.destroy();
  }).gc("inner");

  router.stop();
}
