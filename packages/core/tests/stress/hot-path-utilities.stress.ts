import { describe, it, expect } from "vitest";

import { getPluginApi } from "@real-router/core/api";

import {
  createStressRouter,
  formatBytes,
  MB,
  measureTime,
  takeHeapSnapshot,
} from "./helpers";

describe("S17: Hot path utilities", () => {
  it("S17.1 shouldUpdateNode predicate 10,000x: consistent results, heap stable", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const predicate = router.shouldUpdateNode("route0");

    await router.navigate("route1");

    const toState = router.getState();
    const fromState = router.getPreviousState();

    // eslint-disable-next-line vitest/no-conditional-in-test
    if (!toState || !fromState) {
      throw new Error("expected states to be defined");
    }

    const heapBefore = takeHeapSnapshot();

    let trueCount = 0;

    for (let i = 0; i < 10_000; i++) {
      if (predicate(toState, fromState)) {
        trueCount++;
      }
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(trueCount).toBe(10_000);
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(2 * MB);

    router.stop();
    router.dispose();
  });

  it("S17.2 areStatesEqual 10,000x with deep nested params: < 0.01ms per call average", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const pluginApi = getPluginApi(router);

    const deepParams1 = {
      id: "1",
      filter: { category: "books", sort: { field: "date", order: "desc" } },
      meta: { page: 1, nested: { deep: { value: "a" } } },
    };
    const deepParams2 = {
      id: "1",
      filter: { category: "books", sort: { field: "date", order: "asc" } },
      meta: { page: 1, nested: { deep: { value: "b" } } },
    };

    const state1 = pluginApi.makeState("route0", deepParams1, "/route0");
    const state2 = pluginApi.makeState("route0", deepParams2, "/route0");

    const { durationMs } = measureTime(() => {
      for (let i = 0; i < 10_000; i++) {
        router.areStatesEqual(state1, state2);
      }
    });

    expect(durationMs / 10_000).toBeLessThan(0.01);

    router.stop();
    router.dispose();
  });

  it("S17.3 shouldUpdateNode factory 1,000 closures: GC collects, heap stable", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      router.shouldUpdateNode("route0");
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(2 * MB);

    router.stop();
    router.dispose();
  });
});
