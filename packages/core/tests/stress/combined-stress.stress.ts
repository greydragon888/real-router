import { describe, it, expect } from "vitest";

import { cloneRouter, getLifecycleApi, getRoutesApi } from "@real-router/core";

import {
  createFlatRoutes,
  createStressRouter,
  formatBytes,
  fullPluginFactory,
  MB,
  noopPluginFactory,
  takeHeapSnapshot,
} from "./helpers";

const createFullPlugin = () => () => fullPluginFactory();

const alwaysAllowGuardFn = () => true;

const alwaysAllowGuard = () => alwaysAllowGuardFn;

describe("S9: Combined load scenarios", () => {
  it("S9.1: SPA simulation — 50 routes, 5 plugins, 10 guards, 20 listeners, 500 navigations", async () => {
    const router = createStressRouter(50);

    for (let i = 0; i < 5; i++) {
      router.usePlugin(createFullPlugin());
    }

    const lifecycle = getLifecycleApi(router);

    for (let i = 0; i < 10; i++) {
      lifecycle.addActivateGuard(`route${i}`, alwaysAllowGuard);
    }

    const unsubs: (() => void)[] = [];

    for (let i = 0; i < 20; i++) {
      unsubs.push(
        router.subscribe(() => {
          /* noop */
        }),
      );
    }

    await router.start("/route0");

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 500; i++) {
      await router.navigate(`route${(i % 49) + 1}`);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(20 * MB);
    expect(router.getState()).toBeDefined();

    for (const unsub of unsubs) {
      unsub();
    }

    router.stop();
    router.dispose();
  }, 60_000);

  it("S9.2: SSR clone storm — cloneRouter × 200, each navigate + dispose", async () => {
    const router = createStressRouter(20);

    await router.start("/route0");

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      const clone = cloneRouter(router);

      await clone.start("/route0");
      await clone.navigate(`route${(i % 19) + 1}`);
      clone.stop();
      clone.dispose();
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    router.stop();
    router.dispose();

    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(20 * MB);
  }, 60_000);

  it("S9.3: Hot reload simulation — 50 replace cycles, navigate after each, state always valid", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const routesApi = getRoutesApi(router);

    for (let i = 0; i < 50; i++) {
      const newRoutes = createFlatRoutes(10 + (i % 5));

      routesApi.replace(newRoutes);

      await router.navigate(`route${i % 5}`).catch(() => {});

      const state = router.getState();

      expect(state).toBeDefined();
    }

    router.stop();
    router.dispose();
  }, 30_000);

  it("S9.4: Mount/unmount storm — 100 create/start/navigate/stop/dispose cycles", async () => {
    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const r = createStressRouter(10);

      r.usePlugin(noopPluginFactory);
      await r.start("/route0");
      await r.navigate(`route${(i % 9) + 1}`);
      r.stop();
      r.dispose();
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(10 * MB);
  }, 60_000);
});
