import { describe, it, expect } from "vitest";

import { createRouter, getDependenciesApi } from "@real-router/core";

import { createFlatRoutes, formatBytes, MB, takeHeapSnapshot } from "./helpers";

describe("S13: Dependencies store churn", () => {
  it("S13.1 set/remove cycle 1000x: store remains empty, heap growth < 2MB", () => {
    const router = createRouter<Record<string, number>>(createFlatRoutes(5), {
      defaultRoute: "route0",
    });
    const deps = getDependenciesApi(router);

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      deps.set("key", i);
      deps.remove("key");
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    expect(deps.has("key")).toBe(false);
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(2 * MB);

    router.stop();
    router.dispose();
  });

  it("S13.2 setAll 50 keys × 100 overwrites: store has exactly 50 entries", () => {
    const router = createRouter<Record<string, number>>([], {
      limits: { maxDependencies: 200 },
    });
    const deps = getDependenciesApi(router);

    const batch: Record<string, number> = {};

    for (let i = 0; i < 50; i++) {
      batch[`key${i}`] = i;
    }

    const heapBefore = takeHeapSnapshot();

    for (let cycle = 0; cycle < 100; cycle++) {
      deps.setAll(batch);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    const all = deps.getAll();

    expect(Object.keys(all)).toHaveLength(50);
    expect(all.key0).toBe(0);
    expect(all.key49).toBe(49);
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(2 * MB);

    router.stop();
    router.dispose();
  });

  it("S13.3 limit boundary: 100 deps fit, 101st throws, recover after remove", () => {
    const router = createRouter<Record<string, number>>([], {
      limits: { maxDependencies: 100 },
    });
    const deps = getDependenciesApi(router);

    for (let i = 0; i < 100; i++) {
      expect(() => {
        deps.set(`dep${i}`, i);
      }).not.toThrowError();
    }

    expect(() => {
      deps.set("dep100", 100);
    }).toThrowError();

    for (let i = 0; i < 50; i++) {
      deps.remove(`dep${i}`);
    }

    for (let i = 0; i < 50; i++) {
      expect(() => {
        deps.set(`newdep${i}`, i);
      }).not.toThrowError();
    }

    expect(deps.has("dep50")).toBe(true);
    expect(deps.has("dep0")).toBe(false);
    expect(deps.has("newdep0")).toBe(true);

    router.stop();
    router.dispose();
  });

  it("S13.4 reset + refill 100 cycles: store correct, heap stable", () => {
    const router = createRouter<Record<string, number>>([], {
      limits: { maxDependencies: 0 },
    });
    const deps = getDependenciesApi(router);

    const batch: Record<string, number> = {};

    for (let i = 0; i < 50; i++) {
      batch[`key${i}`] = i;
    }

    const heapBefore = takeHeapSnapshot();

    for (let cycle = 0; cycle < 100; cycle++) {
      deps.reset();
      deps.setAll(batch);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    const all = deps.getAll();

    expect(Object.keys(all)).toHaveLength(50);
    expect(all.key0).toBe(0);
    expect(all.key49).toBe(49);
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(2 * MB);

    router.stop();
    router.dispose();
  });
});
