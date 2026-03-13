import { describe, it, expect } from "vitest";

import { getLifecycleApi } from "@real-router/core";

import {
  createStressRouter,
  formatBytes,
  forceGC,
  fullPluginFactory,
  MB,
  takeHeapSnapshot,
} from "./helpers";

const createFullPlugin = () => () => fullPluginFactory();

const alwaysAllowGuardFn = () => true;

const alwaysAllowGuard = () => alwaysAllowGuardFn;

describe("S4. Router dispose completeness", () => {
  it("should return heap to baseline after creating and disposing 100 routers", async () => {
    const before = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const router = createStressRouter(10);

      await router.start("/route0");
      await router.navigate("route1");
      router.dispose();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(2 * MB);
  });

  it("should return heap to baseline after disposing router loaded with 10 plugins, 50 listeners, and 20 guards", async () => {
    const before = takeHeapSnapshot();

    const router = createStressRouter(10);
    const lifecycle = getLifecycleApi(router);

    for (let i = 0; i < 10; i++) {
      router.usePlugin(createFullPlugin());
    }

    for (let l = 0; l < 50; l++) {
      router.subscribe(() => {});
    }

    for (let g = 0; g < 20; g++) {
      lifecycle.addActivateGuard(`route${g % 10}`, alwaysAllowGuard);
    }

    await router.start("/route0");
    await router.navigate("route1");
    router.dispose();

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(2 * MB);
  });

  it("should not leave unhandled rejections and heap stays below 10 MB when disposing during active navigation × 50", async () => {
    const before = takeHeapSnapshot();

    for (let i = 0; i < 50; i++) {
      const router = createStressRouter(5);

      await router.start("/route0");

      const navigationPromise = router.navigate("route4");

      router.dispose();

      await navigationPromise.catch(() => {});
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(10 * MB);
  });

  it("should release router object to GC after dispose (WeakRef check)", async () => {
    const refs: WeakRef<object>[] = [];

    for (let i = 0; i < 100; i++) {
      const router = createStressRouter(5);

      refs.push(new WeakRef(router));
      router.dispose();
    }

    forceGC();
    await new Promise((resolve) => setTimeout(resolve, 50));
    forceGC();

    const collected = refs.filter((r) => r.deref() === undefined).length;

    expect(collected).toBeGreaterThan(50);
  });

  it("should be idempotent — double dispose 100 times should not throw", async () => {
    const before = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const router = createStressRouter(5);

      await router.start("/route0");
      router.dispose();

      expect(() => {
        router.dispose();
      }).not.toThrowError();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(5 * MB);
  });
});
