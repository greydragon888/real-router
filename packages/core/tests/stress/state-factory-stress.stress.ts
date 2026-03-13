import { describe, afterEach, it, expect } from "vitest";

import { getPluginApi } from "@real-router/core";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";

describe("S21: makeState / buildState memory", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S21.1: 10,000 makeState() calls with unique params — heap stable", async () => {
    router = createStressRouter(100);
    await router.start("/route0");

    const pluginApi = getPluginApi(router);

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 10_000; i++) {
      pluginApi.makeState(
        `route${i % 100}`,
        { id: String(i) },
        `/route${i % 100}`,
      );
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);

  it("S21.2: buildState() × 10,000 — heap stable", async () => {
    router = createStressRouter(100);
    await router.start("/route0");

    const pluginApi = getPluginApi(router);

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 10_000; i++) {
      const result = pluginApi.buildState(`route${i % 100}`, { id: String(i) });

      expect(result).toBeDefined();
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);

  it("S21.3: buildNavigationState() × 5,000 — heap stable", async () => {
    router = createStressRouter(100);
    await router.start("/route0");

    const pluginApi = getPluginApi(router);

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 5000; i++) {
      const result = pluginApi.buildNavigationState(`route${i % 100}`, {
        id: String(i),
      });

      expect(result).toBeDefined();
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);
});
