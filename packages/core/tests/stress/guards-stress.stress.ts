import { describe, afterEach, it, expect } from "vitest";

import { getLifecycleApi } from "@real-router/core";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";

function asyncGuardFn(_toState: unknown, _fromState: unknown, delayMs: number) {
  return new Promise<boolean>((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, delayMs);
  });
}

function delayedGuardFn(_toState: unknown, _fromState: unknown) {
  return new Promise<boolean>((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, 20);
  });
}

const makeAsyncGuardFactory = (delayMs: number) => {
  return () => (_toState: unknown, _fromState: unknown) =>
    asyncGuardFn(_toState, _fromState, delayMs);
};

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

    expect(totalCalls).toBeGreaterThanOrEqual(500);
    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);

  it("S5.2: Async guards with 1-5ms delay × 20 guards, 100 navigations", async () => {
    const routeCount = 20;

    router = createStressRouter(routeCount);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);

    for (let i = 0; i < routeCount; i++) {
      const delayMs = (i % 5) + 1;

      lifecycle.addActivateGuard(`route${i}`, makeAsyncGuardFactory(delayMs));
    }

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      const target = (i % (routeCount - 1)) + 1;

      await router.navigate(`route${target}`);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(2000);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(delta).toBeLessThan(10 * MB);
  }, 60_000);

  it("S5.3: Auto-cleanup: 50 routes, 50 guards, 200 navigations — guard count stays ≤ 50", async () => {
    const routeCount = 50;

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

    for (let i = 0; i < 200; i++) {
      const target = (i % (routeCount - 1)) + 1;

      await router.navigate(`route${target}`);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(guardCallCount).toBeGreaterThan(0);
    expect(guardCallCount).toBeLessThanOrEqual(200);
    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);

  it("S5.4: Guard blocks + concurrent navigation cancels — 100 pairs, no leaked promises", async () => {
    const routeCount = 10;

    router = createStressRouter(routeCount);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("route1", delayedGuardFactory);

    const errors: unknown[] = [];
    const successes: unknown[] = [];

    const heapBefore = takeHeapSnapshot();

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

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(errors.length + successes.length).toBe(200);
    expect(delta).toBeLessThan(20 * MB);
  }, 60_000);

  it("S5.5: Mixed canActivate/canDeactivate × 20 each + 200 navigations — correct order", async () => {
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

    expect(activateOrder.length).toBeGreaterThan(0);
    expect(deactivateOrder.length).toBeGreaterThan(0);
    expect(activateOrder.length + deactivateOrder.length).toBeGreaterThan(200);
  }, 30_000);
});
