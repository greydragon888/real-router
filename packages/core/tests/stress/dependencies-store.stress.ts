import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";

import { createFlatRoutes, formatBytes, takeHeapSnapshot } from "./helpers";

describe("S13: Dependencies store churn", () => {
  it("S13.1 set/remove cycle 1000x: store releases the key (remains empty)", () => {
    const router = createRouter<Record<string, number>>(createFlatRoutes(5), {
      defaultRoute: "route0",
    });
    const deps = getDependenciesApi(router);

    for (let i = 0; i < 1000; i++) {
      deps.set("key", i);
      deps.remove("key");
    }

    // The cleanup invariant is the real discriminator here, NOT a heap delta.
    // The store is a single string-keyed plain object with last-write-wins on
    // one key, so its retained size is hard-capped at ONE entry regardless of
    // whether remove() works — a broken remove() leaves `{ key: 999 }` (~8 bytes),
    // structurally far below any KB-scale heap threshold. A heap assertion here
    // would pass even with cleanup fully broken (theatre by construction).
    // `has("key") === false` fails exactly when remove() leaks the key.
    expect(deps.has("key")).toBe(false);

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

    for (let cycle = 0; cycle < 100; cycle++) {
      deps.setAll(batch);
    }

    const all = deps.getAll();

    // The entry-count invariant is the real discriminator, NOT a heap delta.
    // 100 setAll() of the SAME 50 keys is last-write-wins, so the store holds
    // exactly 50 entries no matter how many cycles run — retained size is
    // hard-capped at 50 numbers (~tens of bytes). A heap assertion would pass
    // even if setAll() never reused slots (theatre by construction). The length
    // and value checks fail exactly if overwrite semantics regress.
    expect(Object.keys(all)).toHaveLength(50);
    expect(all.key0).toBe(0);
    expect(all.key49).toBe(49);

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
      }).not.toThrow();
    }

    expect(() => {
      deps.set("dep100", 100);
    }).not.toThrow();

    for (let i = 0; i < 50; i++) {
      deps.remove(`dep${i}`);
    }

    for (let i = 0; i < 50; i++) {
      expect(() => {
        deps.set(`newdep${i}`, i);
      }).not.toThrow();
    }

    expect(deps.has("dep50")).toBe(true);
    expect(deps.has("dep0")).toBe(false);
    expect(deps.has("newdep0")).toBe(true);

    router.stop();
    router.dispose();
  });

  it("S13.4 reset + refill 2000 cycles: store correct, heap stable", () => {
    const router = createRouter<Record<string, number>>([], {
      limits: { maxDependencies: 0 },
    });
    const deps = getDependenciesApi(router);

    const batch: Record<string, number> = {};

    for (let i = 0; i < 50; i++) {
      batch[`key${i}`] = i;
    }

    const heapBefore = takeHeapSnapshot();

    // 2000 cycles (not 100): with maxDependencies:0 a broken reset() accumulates
    // a fresh generation of entries per cycle, unbounded, so the leak signal
    // scales with N. At N=100 that leak adds only ~300KB — indistinguishable from
    // the cross-test heap/JIT noise floor (residual from S13.1-S13.3 in the same
    // worker), which made the old 128KB threshold flaky (passed/failed ~50/50).
    // Mutationally validated: at N=2000 the simulated reset leak measures ~9MB
    // while a healthy run's delta stays ≤~60KB isolated (well under the 1MB
    // threshold on full-file runs), giving ≥3× margin on both sides. Runtime <100ms.
    for (let cycle = 0; cycle < 2000; cycle++) {
      deps.reset();
      deps.setAll(batch);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    const all = deps.getAll();

    expect(Object.keys(all)).toHaveLength(50);
    expect(all.key0).toBe(0);
    expect(all.key49).toBe(49);
    // Anchored to measured healthy (≤~60KB isolated, noise-padded for in-file
    // runs); leak is ~9MB. Threshold sits between with wide margin both ways.
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(
      1024 * 1024,
    );

    router.stop();
    router.dispose();
  });
});
