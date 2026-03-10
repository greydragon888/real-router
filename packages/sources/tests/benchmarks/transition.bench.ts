/**
 * Transition source benchmarks
 *
 * Tests the transition source lifecycle:
 * - createTransitionSource factory cost (create + destroy)
 * - subscribe/unsubscribe cycles (ACCUMULATION — add + remove fallback)
 * - getSnapshot hot path (NON-MUTATING — source outside bench)
 * - Transition event processing (TRANSITION_START → TRANSITION_SUCCESS cycle)
 * - Transition event processing with multiple listeners (fan-out)
 * - Stress: 50 transitionSources on one router with navigation fan-out
 *
 * Operation type: Mixed — creation, subscription, and event-based notification
 */

import { createRouter } from "@real-router/core";
import { bench, do_not_optimize } from "mitata";

import { createTransitionSource } from "../../src";

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
// 1. Creation
// ============================================================================

// 1.1 createTransitionSource factory cost
// Type: ONE-TIME — create + destroy fallback
{
  const router = createTestRouter();

  bench("1.1 createTransitionSource factory cost", () => {
    const source = createTransitionSource(router);

    source.destroy();
  }).gc("inner");

  router.stop();
}

// ============================================================================
// 2. Subscription
// ============================================================================

// 2.1 subscribe + unsubscribe on transitionSource
// Type: ACCUMULATION — subscribe + unsubscribe fallback
{
  const router = createTestRouter();
  const source = createTransitionSource(router);

  bench("2.1 subscribe + unsubscribe on transitionSource", () => {
    const listener = () => {};
    const unsub = source.subscribe(listener);

    unsub();
  }).gc("inner");

  source.destroy();
  router.stop();
}

// 2.2 getSnapshot on transitionSource (hot path)
// Type: NON-MUTATING — source and router outside
{
  const router = createTestRouter();
  const source = createTransitionSource(router);
  const unsub = source.subscribe(() => {});

  bench("2.2 getSnapshot on transitionSource (hot path)", () => {
    do_not_optimize(source.getSnapshot());
  }).gc("inner");

  unsub();
  source.destroy();
  router.stop();
}

// 2.3 transitionSource full lifecycle (create → subscribe → destroy)
// Type: ONE-TIME — measure full lifecycle cost
{
  const router = createTestRouter();

  bench(
    "2.3 transitionSource full lifecycle (create → subscribe → destroy)",
    () => {
      const source = createTransitionSource(router);
      const unsub = source.subscribe(() => {});

      unsub();
      source.destroy();
    },
  ).gc("inner");

  router.stop();
}

// ============================================================================
// 3. Notification — event-based
// ============================================================================

// 3.1 Transition event processing (TRANSITION_START → TRANSITION_SUCCESS cycle)
// Type: NON-MUTATING — navigate doesn't mutate router
// Measures: sync navigation fires TRANSITION_START + TRANSITION_SUCCESS events
{
  const router = createTestRouter();
  const source = createTransitionSource(router);

  source.subscribe(() => {});

  bench("3.1 Transition event processing (1000 navigations)", () => {
    for (let i = 0; i < 1000; i++) {
      void router.navigate(NAV_ROUTES[i % 2]);
    }
  }).gc("inner");

  source.destroy();
  router.stop();
}

// 3.2 Transition event processing with 10 listeners (fan-out)
// Type: NON-MUTATING
// Measures: 1 navigation → 10 listener callbacks
{
  const router = createTestRouter();
  const source = createTransitionSource(router);

  for (let i = 0; i < 10; i++) {
    source.subscribe(() => {});
  }

  bench(
    "3.2 Transition event processing with 10 listeners (1000 navigations)",
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
// 4. Stress
// ============================================================================

// 4.1 50 transitionSources on one router — navigation with event fan-out
// Type: NON-MUTATING
// Measures: 1 navigation → 50 sources × 4 event listeners each
{
  const router = createTestRouter();

  const sources = Array.from({ length: 50 }, () =>
    createTransitionSource(router),
  );

  for (const source of sources) {
    source.subscribe(() => {});
  }

  bench(
    "4.1 50 transitionSources — navigation with event fan-out (1000 nav)",
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
