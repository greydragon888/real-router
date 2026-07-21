import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { createStressRouter, noop } from "./helpers";

/**
 * B7.8 — heap stability across 10 000 buildUrl() calls
 *
 * `router.buildUrl(name, params)` is invoked on every render pass of
 * every `<Link>` component in every framework adapter. Lists of 1k+
 * links (dashboards, tables) call it in tight loops. Even a single
 * extra closure allocation per call becomes visible at that scale.
 *
 * This test burns 30 000 buildUrl calls with varied inputs, forces GC
 * before/after, and asserts the heap delta stays within a tuned
 * ceiling. Primarily catches:
 *   - closure reallocation per call (a regression in plugin-utils)
 *   - accidental memoization leaks (Map that grows unboundedly)
 *   - Symbol/WeakMap churn inside `buildPath`
 *
 * Discrimination (measured at N = 30 000, `--expose-gc`, jsdom fork):
 *   - healthy delta:  ~0.11 MiB (flat — buildUrl retains nothing per call)
 *   - simulated leak: ~3.24 MiB (retain every result string in a sink array,
 *     i.e. an unbounded per-call cache that never evicts)
 *   - chosen threshold: 1.0 MiB → 8.6x above healthy, 3.24x below the leak.
 *     Both margins are >=3x, so the test fails on a growing cache and stays
 *     green on the healthy path. Anchored to measured healthy, NOT a round
 *     guess — the old 20 MiB ceiling sat ~6x ABOVE even the leak signal and
 *     would have passed a fully-broken unbounded cache.
 */
describe("B7.8 — heap stability across 30 000 buildUrl calls", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(() => {
    globalThis.history.replaceState({}, "", "/");
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("heapUsed delta stays within a generous threshold", async ({ skip }) => {
    // `globalThis.gc` is exposed by --expose-gc (the stress runner enables it
    // via execArgv in vitest.config.stress.mts; normal runs lack it). `skip()`
    // reports this as skipped instead of a silent pass; the following `return`
    // both stops execution and narrows `globalThis.gc` to a function below.
    // eslint-disable-next-line vitest/no-conditional-in-test -- env-gated skip
    if (typeof globalThis.gc !== "function") {
      skip("requires --expose-gc (stress runner only)");

      return;
    }

    const { router } = createStressRouter({ base: "/app" });

    try {
      await router.start();

      const ITER = 30_000;
      const ROUTES = ["home", "users.list", "users.view"] as const;

      // Warm-up — drains one-shot allocations (JIT, route-node cache).
      for (let i = 0; i < 200; i++) {
        router.buildUrl(ROUTES[i % ROUTES.length], { id: String(i) });
      }

      globalThis.gc();
      globalThis.gc();
      const heapBefore = process.memoryUsage().heapUsed;

      for (let i = 0; i < ITER; i++) {
        router.buildUrl(ROUTES[i % ROUTES.length], { id: String(i) });
      }

      globalThis.gc();
      globalThis.gc();
      const heapAfter = process.memoryUsage().heapUsed;

      const deltaMB = (heapAfter - heapBefore) / (1024 * 1024);

      // measured healthy ~0.11 MiB, simulated unbounded-cache leak ~3.24 MiB.
      expect(deltaMB).toBeLessThan(1);
    } finally {
      router.stop();
    }
  });
});
