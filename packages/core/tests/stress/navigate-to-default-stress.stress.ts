import { describe, afterEach, it, expect } from "vitest";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";

describe("S23: navigateToDefault under load", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S23.1: 1,000 navigateToDefault() calls — heap stable", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      const target = (i % 9) + 1;

      await router.navigate(`route${target}`);
      await router.navigateToDefault();

      expect(router.getState()?.name).toBe("route0");
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(delta).toBeLessThan(10 * MB);
  }, 30_000);

  it("S23.2: navigateToDefault() with replace option × 500", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    let successCount = 0;

    for (let i = 0; i < 500; i++) {
      const target = (i % 9) + 1;

      await router.navigate(`route${target}`);

      const state = await router.navigateToDefault({ replace: true });

      if (state.name === "route0") {
        successCount++;
      }
    }

    expect(successCount).toBe(500);
  }, 30_000);
});
