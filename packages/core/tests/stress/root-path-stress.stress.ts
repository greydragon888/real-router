import { describe, afterEach, it, expect } from "vitest";

import { getPluginApi } from "@real-router/core";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";

describe("S24: setRootPath concurrent changes", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S24.1: 100 cycles setRootPath + navigate — consistent behavior", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    const pluginApi = getPluginApi(router);

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const prefix = `/app${i}`;

      pluginApi.setRootPath(prefix);

      expect(pluginApi.getRootPath()).toBe(prefix);

      const target = (i % 9) + 1;

      await router.navigate(`route${target}`);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(router.getState()).toBeDefined();
    expect(delta).toBeLessThan(5 * MB);

    pluginApi.setRootPath("");
  }, 30_000);

  it("S24.2: buildPath reflects rootPath after each change", () => {
    router = createStressRouter(10);
    void router.start("/route0");

    const pluginApi = getPluginApi(router);

    for (let i = 0; i < 200; i++) {
      const prefix = `/prefix${i}`;

      pluginApi.setRootPath(prefix);

      const path = router.buildPath("route1");

      expect(path).toBe(`${prefix}/route1`);
    }

    pluginApi.setRootPath("");
  }, 30_000);
});
