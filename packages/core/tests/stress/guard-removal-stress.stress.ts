import { describe, afterEach, it, expect } from "vitest";

import { getLifecycleApi } from "@real-router/core";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";

describe("S20: Dynamic guard management", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S20.1: Add 50 guards, remove 25 during navigation, navigate 200 more", async () => {
    const routeCount = 50;

    router = createStressRouter(routeCount);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);
    let totalCalls = 0;

    const makeGuardFn = () => (_toState: unknown, _fromState: unknown) => {
      totalCalls++;

      return true;
    };

    for (let i = 1; i < routeCount; i++) {
      lifecycle.addActivateGuard(`route${i}`, () => makeGuardFn());
    }

    for (let i = 0; i < 100; i++) {
      const target = (i % (routeCount - 1)) + 1;

      await router.navigate(`route${target}`);
    }

    const callsBeforeRemoval = totalCalls;

    for (let i = 1; i <= 25; i++) {
      lifecycle.removeActivateGuard(`route${i}`);
    }

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      const target = (i % (routeCount - 1)) + 1;

      await router.navigate(`route${target}`);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(callsBeforeRemoval).toBeGreaterThan(0);
    expect(totalCalls).toBeGreaterThan(callsBeforeRemoval);
    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);

  it("S20.2: removeActivateGuard() during guard execution — 50 cycles, no crash", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);

    const heapBefore = takeHeapSnapshot();

    for (let cycle = 0; cycle < 50; cycle++) {
      let guardExecuted = false;

      lifecycle.addActivateGuard(
        "route1",
        () => (_toState: unknown, _fromState: unknown) => {
          if (!guardExecuted) {
            guardExecuted = true;
            lifecycle.removeActivateGuard("route1");
          }

          return true;
        },
      );

      await router.navigate("route1");

      expect(guardExecuted).toBe(true);

      await router.navigate("route2");
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(delta).toBeLessThan(5 * MB);
  }, 30_000);

  it("S20.3: 100 cycles add/remove all guards + navigation — heap stable", async () => {
    const routeCount = 20;

    router = createStressRouter(routeCount);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);

    const heapBefore = takeHeapSnapshot();

    for (let cycle = 0; cycle < 100; cycle++) {
      for (let i = 1; i < routeCount; i++) {
        lifecycle.addActivateGuard(
          `route${i}`,
          () => (_toState: unknown, _fromState: unknown) => true,
        );
      }

      const target1 = (cycle % (routeCount - 1)) + 1;

      await router.navigate(`route${target1}`);

      for (let i = 1; i < routeCount; i++) {
        lifecycle.removeActivateGuard(`route${i}`);
      }

      const target2 = ((cycle + 5) % (routeCount - 1)) + 1;

      await router.navigate(`route${target2}`);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(router.getState()).toBeDefined();
    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);
});
