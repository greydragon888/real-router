import { describe, afterEach, it, expect } from "vitest";

import { getPluginApi } from "@real-router/core/api";

import {
  createStressRouter,
  formatBytes,
  takeHeapSnapshot,
  MB,
} from "./helpers";

import type { Router } from "@real-router/core";

// These factories return a fresh State each call and the result is dropped /
// reassigned every iteration, so a heap snapshot can't see a per-call leak
// (GC-masked) — the heap lines are throughput guards. Discrimination comes from
// asserting each call produces the CORRECT state (name pinned to the input),
// which catches a factory regression the old `toBeDefined()` / bare-heap form
// would pass straight through.
describe("S21: makeState / buildState memory", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S21.1: 10,000 makeState() calls with unique params — correct + heap stable", async () => {
    router = createStressRouter(100);
    await router.start("/route0");

    const pluginApi = getPluginApi(router);

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 10_000; i++) {
      const state = pluginApi.makeState(
        `route${i % 100}`,
        { id: String(i) },
        undefined,
        `/route${i % 100}`,
      );

      expect(state.name).toBe(`route${i % 100}`);
      expect(state.params.id).toBe(String(i));
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(1 * MB);
  }, 30_000);

  it("S21.2: buildState() × 10,000 — correct + heap stable", async () => {
    router = createStressRouter(100);
    await router.start("/route0");

    const pluginApi = getPluginApi(router);

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 10_000; i++) {
      const result = pluginApi.buildState(`route${i % 100}`, { id: String(i) });

      expect(result?.name).toBe(`route${i % 100}`);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(1 * MB);
  }, 30_000);

  it("S21.3: buildNavigationState() × 5,000 — correct + heap stable", async () => {
    router = createStressRouter(100);
    await router.start("/route0");

    const pluginApi = getPluginApi(router);

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 5000; i++) {
      const result = pluginApi.buildNavigationState(`route${i % 100}`, {
        id: String(i),
      });

      expect(result?.name).toBe(`route${i % 100}`);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(1 * MB);
  }, 30_000);
});
