import { describe, afterEach, it, expect } from "vitest";

import { getLifecycleApi } from "@real-router/core/api";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";

const alwaysDenyGuardFn = () => false;

const alwaysDenyGuardFactory = () => alwaysDenyGuardFn;

const delayedResolveGuardFn = () =>
  new Promise<boolean>((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, 5);
  });

const delayedResolveGuardFactory = () => delayedResolveGuardFn;

describe("S15: Fire-and-forget suppression", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S15.1: 1,000 unawaited navigate() with mixed results — no unhandled rejections", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("route1", alwaysDenyGuardFactory);

    const heapBefore = takeHeapSnapshot();
    const unhandledErrors: unknown[] = [];

    const testHandler = (reason: unknown) => {
      unhandledErrors.push(reason);
    };

    process.on("unhandledRejection", testHandler);

    for (let i = 0; i < 1000; i++) {
      const target = i % 10;

      void router.navigate(`route${target}`);
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    process.off("unhandledRejection", testHandler);

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(unhandledErrors).toHaveLength(0);
    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);

  it("S15.2: 500 concurrent fire-and-forget + dispose — no post-dispose errors", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    const unhandledErrors: unknown[] = [];
    const testHandler = (reason: unknown) => {
      unhandledErrors.push(reason);
    };

    process.on("unhandledRejection", testHandler);

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 500; i++) {
      const target = (i % 9) + 1;

      void router.navigate(`route${target}`);
    }

    router.dispose();

    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    process.off("unhandledRejection", testHandler);

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(unhandledErrors).toHaveLength(0);
    expect(delta).toBeLessThan(20 * MB);

    router = createStressRouter(10);
    await router.start("/route0");
  }, 30_000);

  it("S15.3: 200 unawaited navigate() — each next cancels previous, heap stable", async () => {
    router = createStressRouter(10);

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("route1", delayedResolveGuardFactory);

    await router.start("/route0");

    const heapBefore = takeHeapSnapshot();
    const unhandledErrors: unknown[] = [];

    const testHandler = (reason: unknown) => {
      unhandledErrors.push(reason);
    };

    process.on("unhandledRejection", testHandler);

    for (let i = 0; i < 200; i++) {
      void router.navigate("route1");
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    process.off("unhandledRejection", testHandler);

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(unhandledErrors).toHaveLength(0);
    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);
});
