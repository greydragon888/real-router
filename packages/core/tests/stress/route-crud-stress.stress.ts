import { describe, afterEach, it, expect } from "vitest";

import { getPluginApi, getRoutesApi } from "@real-router/core";

import {
  createStressRouter,
  measureTime,
  MB,
  takeHeapSnapshot,
} from "./helpers";

import type { Router } from "@real-router/core";

describe("S19: Route CRUD under load", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S19.1: 500 cycles add/remove routes during navigation", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    const routesApi = getRoutesApi(router);

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 500; i++) {
      const dynamicName = `dynamic${i}`;

      routesApi.add({ name: dynamicName, path: `/dynamic${i}` });

      const target = (i % 9) + 1;

      await router.navigate(`route${target}`);

      routesApi.remove(dynamicName);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(router.getState()).toBeDefined();
    expect(routesApi.has("dynamic0")).toBe(false);
    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);

  it("S19.2: update() route config during 200 navigations", async () => {
    router = createStressRouter(20);
    await router.start("/route0");

    const routesApi = getRoutesApi(router);
    let updateCount = 0;
    let lastTarget = 0;

    for (let i = 0; i < 200; i++) {
      const target = (i % 19) + 1;

      routesApi.update(`route${target}`, {
        defaultParams: { iteration: String(i) },
      });

      await router.navigate(`route${target}`);
      updateCount++;
      lastTarget = target;
    }

    expect(updateCount).toBe(200);
    expect(router.getState()?.name).toBe(`route${lastTarget}`);
  }, 30_000);

  it("S19.3: clear() after concurrent navigations", async () => {
    router = createStressRouter(50);
    await router.start("/route0");

    const routesApi = getRoutesApi(router);

    const promises = Array.from({ length: 10 }, (_, i) =>
      router.navigate(`route${i + 1}`).catch(() => {}),
    );

    await Promise.allSettled(promises);

    routesApi.clear();

    expect(routesApi.has("route0")).toBe(false);
    expect(routesApi.has("route1")).toBe(false);
  }, 30_000);

  it("S19.4: add 1000 routes + buildPath/matchPath each — avg < 1ms", () => {
    router = createStressRouter(10);
    void router.start("/route0");

    const routesApi = getRoutesApi(router);
    const pluginApi = getPluginApi(router);

    const bulkRoutes = Array.from({ length: 1000 }, (_, i) => ({
      name: `bulk${i}`,
      path: `/bulk${i}`,
    }));

    routesApi.add(bulkRoutes);

    const heapBefore = takeHeapSnapshot();
    let elapsed = 0;

    for (let i = 0; i < 1000; i++) {
      const { result: path, durationMs: buildMs } = measureTime(() =>
        router.buildPath(`bulk${i}`),
      );
      const { result: match, durationMs: matchMs } = measureTime(() =>
        pluginApi.matchPath(path),
      );

      elapsed += buildMs + matchMs;

      expect(match?.name).toBe(`bulk${i}`);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(elapsed / 1000).toBeLessThan(1);
    expect(delta).toBeLessThan(20 * MB);
  }, 30_000);
});
