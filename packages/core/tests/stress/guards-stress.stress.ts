import { describe, afterEach, it, expect } from "vitest";

import { getLifecycleApi } from "@real-router/core/api";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";

function delayedGuardFn(_toState: unknown, _fromState: unknown) {
  return new Promise<boolean>((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, 20);
  });
}

const delayedGuardFactory = () => {
  return delayedGuardFn;
};

describe("S5: Guards under load", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S5.1: 100 activate guards on different routes + 500 navigations", async () => {
    const routeCount = 100;

    router = createStressRouter(routeCount);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);
    const callCounts: number[] = Array.from({ length: routeCount }, () => 0);

    const makeGuardFn =
      (idx: number) => (_toState: unknown, _fromState: unknown) => {
        callCounts[idx]++;

        return true;
      };

    for (let i = 0; i < routeCount; i++) {
      lifecycle.addActivateGuard(`route${i}`, () => makeGuardFn(i));
    }

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 500; i++) {
      const target = (i % (routeCount - 1)) + 1;

      await router.navigate(`route${target}`);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    const totalCalls = callCounts.reduce((sum, c) => sum + c, 0);

    // 500 navigations, each entering exactly one guarded route → exactly 500
    // activate-guard calls (activate guards are not auto-cleaned). The old
    // `>= 500` passed even if guards over-fired (re-accumulation).
    expect(totalCalls).toBe(500);
    // Throughput guard: persistent router; per-nav state retention is the leak
    // validated discriminatingly by S5.3 (N=20k), here N=500 keeps it in noise.
    expect(delta).toBeLessThan(2 * MB);
  }, 30_000);

  it("S5.3: Auto-cleanup — 50 guards, 20,000 navigations: guard storage and heap stay bounded", async () => {
    const routeCount = 50;
    const NAV = 20_000;

    router = createStressRouter(routeCount);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);
    let guardCallCount = 0;

    const countingGuardFn = (_toState: unknown, _fromState: unknown) => {
      guardCallCount++;

      return true;
    };

    for (let i = 0; i < routeCount; i++) {
      lifecycle.addActivateGuard(`route${i}`, () => countingGuardFn);
    }

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < NAV; i++) {
      const target = (i % (routeCount - 1)) + 1;

      await router.navigate(`route${target}`);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    // Auto-cleanup: each navigation fires the target route's activate guard
    // exactly once. If guards re-accumulated (re-registered per navigation
    // instead of last-add-wins in the Map<routeName> store), the count would
    // exceed NAV.
    expect(guardCallCount).toBeGreaterThan(0);
    expect(guardCallCount).toBeLessThanOrEqual(NAV);

    // Heap guard with PROVEN discrimination (measured under --expose-gc + 2-pass
    // GC). Healthy: states roll over (current/previous), so retention saturates
    // at ~0.48 MB and is deterministic run-to-run. Leak (StateNamespace retains
    // every state instead of rolling over): ~7.0 MB at NAV=20k. THRESHOLD = 2 MB
    // sits ~4× above healthy and ~3.5× below the leak. NAV is 20k (not a few
    // hundred) on purpose: at NAV=200 the whole retain-all leak is only ~0.18 MB
    // — below any threshold that clears healthy+jitter, so the gate could not
    // discriminate (theatre). Validated mutationally by retaining
    // `router.getState()` each iteration → delta jumps to ~7 MB and the gate
    // trips. Runtime ~50 ms.
    expect(delta).toBeLessThan(2 * MB);
  }, 30_000);

  it("S5.4: Guard blocks + concurrent navigation cancels — 100 pairs, no leaked promises", async () => {
    const routeCount = 10;

    router = createStressRouter(routeCount);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("route1", delayedGuardFactory);

    const errors: unknown[] = [];
    const successes: unknown[] = [];

    for (let i = 0; i < 100; i++) {
      const p1 = router.navigate("route1").then(
        (s) => {
          successes.push(s);

          return;
        },
        (error: unknown) => {
          errors.push(error);

          return;
        },
      );
      const p2 = router.navigate("route2").then(
        (s) => {
          successes.push(s);

          return;
        },
        (error: unknown) => {
          errors.push(error);

          return;
        },
      );

      await Promise.all([p1, p2]);
    }

    // Liveness: all 200 navigations settle (no hang). The sum is tautological on
    // its own (every promise resolves or rejects), so it only guards a deadlock —
    // the discriminating post-condition is below.
    expect(errors.length + successes.length).toBe(200);

    // After 100 block+cancel pairs the router is still functional — a fresh
    // navigation to a guard-free route commits. (Dropped a GC-masked heap line:
    // superseded-nav promises settle and are reclaimed regardless of leaks.)
    await router.navigate("route5").catch(() => {});

    expect(router.getState()?.name).toBe("route5");
  }, 60_000);

  it("S5.5: Mixed canActivate/canDeactivate × 19 each + 200 navigations — activate re-fires, deactivate is auto-cleaned (one-shot)", async () => {
    router = createStressRouter(20);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);
    const activateOrder: number[] = [];
    const deactivateOrder: number[] = [];

    const makeActivateGuardFn =
      (idx: number) => (_toState: unknown, _fromState: unknown) => {
        activateOrder.push(idx);

        return true;
      };

    const makeDeactivateGuardFn =
      (idx: number) => (_toState: unknown, _fromState: unknown) => {
        deactivateOrder.push(idx);

        return true;
      };

    for (let i = 1; i <= 19; i++) {
      lifecycle.addActivateGuard(`route${i}`, () => makeActivateGuardFn(i));
      lifecycle.addDeactivateGuard(`route${i}`, () => makeDeactivateGuardFn(i));
    }

    for (let i = 0; i < 200; i++) {
      const target = (i % 19) + 1;

      await router.navigate(`route${target}`);
    }

    // Flat sibling routes, 200 navs cycling route1..19:
    //  - activate guards re-fire on EVERY entry → exactly 200 activations
    //    (every nav enters a guarded target; activate guards are never cleaned).
    //  - canDeactivate guards are AUTO-CLEANED when a route deactivates
    //    (completeTransition → clearCanDeactivate; see auto-cleanup.test.ts),
    //    so each route's deactivate guard fires exactly ONCE — on its first
    //    leave (i=1..19) — then is removed; subsequent leaves don't re-fire.
    //    → exactly 19 deactivations (route1..route19, once each).
    // Exact counts discriminate BOTH the firing AND the auto-cleanup: the old
    // `> 0` / `> 200` asserts passed even if deactivate guards leaked (no
    // cleanup, ~199) or 199 of 200 transitions skipped their guards.
    // (Hierarchical innermost→outermost ORDER is covered by property suite
    // `guards.properties.ts` #3 — flat routes here can't exercise it.)
    expect(activateOrder).toHaveLength(200);
    expect(deactivateOrder).toHaveLength(19);
  }, 30_000);
});
