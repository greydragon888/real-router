import { describe, it, expect } from "vitest";

import { getRoutesApi } from "@real-router/core/api";

import {
  createStressRouter,
  formatBytes,
  MB,
  takeHeapSnapshot,
} from "./helpers";

describe("TREE_CHANGED memory", () => {
  it("does not leak across 10,000 add/remove cycles with an active subscriber", () => {
    const router = createStressRouter(1); // route0
    const routes = getRoutesApi(router);

    let received = 0;
    const unsubscribe = routes.subscribeChanges(() => {
      received++;
    });

    const before = takeHeapSnapshot();

    for (let i = 0; i < 10_000; i++) {
      routes.add({ name: `dyn${i}`, path: `/dyn${i}` });
      routes.remove(`dyn${i}`);
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    // 2 events per cycle (add + remove) — payloads must not be retained.
    expect(received).toBe(20_000);
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(5 * MB);

    unsubscribe();
    router.stop();
    router.dispose();
  });

  it("releases handler refs across 50,000 subscribeChanges → unsubscribe cycles", () => {
    const router = createStressRouter(1);
    const routes = getRoutesApi(router);

    const before = takeHeapSnapshot();

    // 50k (not 10k) so the test actually DISCRIMINATES: a broken unsubscribe
    // retains ~1.8 MB per 10k cycles (measured), i.e. ~9 MB here — far above
    // the 1 MB ceiling, while a healthy run reclaims to ~0. At 10k the leak
    // signal (1.8 MB) sat below the old 2 MB ceiling, so the test could not fail.
    for (let i = 0; i < 50_000; i++) {
      const unsubscribe = routes.subscribeChanges(() => {});

      unsubscribe();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(MB);
    expect(routes.subscribeChanges).toBeTypeOf("function");

    router.stop();
    router.dispose();
  });

  it("does not leak under add+clear churn with many subscribers", () => {
    const router = createStressRouter(1);
    const routes = getRoutesApi(router);

    let invocations = 0;
    const unsubs: (() => void)[] = [];

    for (let i = 0; i < 50; i++) {
      unsubs.push(
        routes.subscribeChanges(() => {
          invocations++;
        }),
      );
    }

    const before = takeHeapSnapshot();

    // Alternate add+clear so BOTH payloads are non-empty (the previous version
    // cleared an already-empty tree 999/1000 times, exercising nothing).
    // 1,000 × (add + clear) × 50 subscribers = 100,000 invocations.
    for (let i = 0; i < 1000; i++) {
      routes.add([
        { name: `a${i}`, path: `/a${i}` },
        { name: `b${i}`, path: `/b${i}` },
      ]);
      routes.clear();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(invocations).toBe(100_000);
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(5 * MB);

    for (const unsub of unsubs) {
      unsub();
    }

    router.stop();
    router.dispose();
  });
});
