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
 * This test burns 10 000 buildUrl calls with varied inputs, forces GC
 * before/after, and asserts the heap delta stays within a generous
 * ceiling. Primarily catches:
 *   - closure reallocation per call (a regression in plugin-utils)
 *   - accidental memoization leaks (Map that grows unboundedly)
 *   - Symbol/WeakMap churn inside `buildPath`
 *
 * Threshold 20 MiB is intentionally loose — V8 background overhead
 * alone can reach single-digit MiB on fork start. We're after obvious
 * unbounded growth, not tight allocation regressions.
 */
describe("B7.8 — heap stability across 10 000 buildUrl calls", () => {
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

  it("heapUsed delta stays within a generous threshold", async () => {
    // Skip in environments without --expose-gc (the stress runner enables
    // it via execArgv in vitest.config.stress.mts; normal runs lack it).
    // eslint-disable-next-line vitest/no-conditional-in-test -- env-gated skip
    if (typeof globalThis.gc !== "function") {
      return;
    }

    const { router } = createStressRouter({ base: "/app" });

    try {
      await router.start();

      const ITER = 10_000;
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

      expect(deltaMB).toBeLessThan(20);
    } finally {
      router.stop();
    }
  });
});
