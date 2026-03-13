import { describe, afterEach, it, expect } from "vitest";

import { getLifecycleApi, errorCodes, RouterError } from "@real-router/core";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";

const alwaysDenyGuardFn = () => false;

const alwaysDenyGuardFactory = () => alwaysDenyGuardFn;

describe("S11: Error path storm", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S11.1: Guard rejection storm — 500 CANNOT_ACTIVATE errors, FSM stays READY, heap stable", async () => {
    router = createStressRouter(5);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("route1", alwaysDenyGuardFactory);

    const heapBefore = takeHeapSnapshot();
    let cannotActivateCount = 0;

    for (let i = 0; i < 500; i++) {
      try {
        await router.navigate("route1");
      } catch (error: unknown) {
        if (
          error instanceof RouterError &&
          error.code === errorCodes.CANNOT_ACTIVATE
        ) {
          cannotActivateCount++;
        }
      }
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(cannotActivateCount).toBe(500);
    expect(router.isActive()).toBe(true);
    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);

  it("S11.2: SAME_STATES storm — 500 SAME_STATES rejections, no leaks", async () => {
    router = createStressRouter(5);
    await router.start("/route0");
    await router.navigate("route1");

    const heapBefore = takeHeapSnapshot();
    let sameStatesCount = 0;

    for (let i = 0; i < 500; i++) {
      try {
        await router.navigate("route1");
      } catch (error: unknown) {
        if (
          error instanceof RouterError &&
          error.code === errorCodes.SAME_STATES
        ) {
          sameStatesCount++;
        }
      }
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(sameStatesCount).toBe(500);
    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);

  it("S11.3: ROUTE_NOT_FOUND storm — 500 correct rejections, emitTransitionError does not leak", async () => {
    router = createStressRouter(5);
    await router.start("/route0");

    const heapBefore = takeHeapSnapshot();
    let routeNotFoundCount = 0;

    for (let i = 0; i < 500; i++) {
      try {
        await router.navigate(`nonexistent_route_${i}`);
      } catch (error: unknown) {
        if (
          error instanceof RouterError &&
          error.code === errorCodes.ROUTE_NOT_FOUND
        ) {
          routeNotFoundCount++;
        }
      }
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(routeNotFoundCount).toBe(500);
    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);

  it("S11.4: Mixed error recovery — 500 success/failure pairs, FSM always correct", async () => {
    router = createStressRouter(5);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("route1", alwaysDenyGuardFactory);

    const heapBefore = takeHeapSnapshot();
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < 500; i++) {
      try {
        await router.navigate("route1");
      } catch {
        errorCount++;
      }

      try {
        const target = (i % 3) + 2;

        await router.navigate(`route${target}`);
        successCount++;
      } catch {
        errorCount++;
      }
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(errorCount).toBeGreaterThan(0);
    expect(successCount).toBeGreaterThan(0);
    expect(router.isActive()).toBe(true);
    expect(delta).toBeLessThan(20 * MB);
  }, 30_000);

  it("S11.5: Plugin onTransitionError storm — 10 plugins × 500 error navigations, all receive errors, heap stable", async () => {
    router = createStressRouter(5);

    const errorCounts: number[] = Array.from({ length: 10 }, () => 0);

    for (let p = 0; p < 10; p++) {
      const idx = p;

      router.usePlugin(() => ({
        onTransitionError() {
          errorCounts[idx]++;
        },
      }));
    }

    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("route1", alwaysDenyGuardFactory);

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 500; i++) {
      await router.navigate("route1").catch(() => {});
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    for (let p = 0; p < 10; p++) {
      expect(errorCounts[p]).toBe(500);
    }

    expect(delta).toBeLessThan(20 * MB);
  }, 30_000);
});
