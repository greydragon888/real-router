import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { createStressRouter, noop } from "./helpers";

/**
 * Heap-usage assertion is intentionally loose: GC in V8 is non-deterministic
 * and Node does not guarantee a forced collection even with --expose-gc.
 * What we DO assert: after 1000 full start → navigate → stop → unsubscribe
 * cycles, allocated memory must not grow more than 25× the measured baseline.
 * The 25× headroom covers:
 *   - `pool: "threads"` fan-out (other tests running in the same worker),
 *   - JIT warm-up allocations,
 *   - transient coverage instrumentation buffers.
 * A genuine listener/closure leak (entries arrays never GC'd, unsubscribe
 * not released) would typically produce 100×+ growth in a 1000-cycle loop.
 */

describe("S13: memory leak detection across start/navigate/stop cycles", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("S13.1: 1000 start→navigate×5→stop→unsubscribe cycles do not accumulate unbounded heap", async () => {
    // Warm-up: single cycle to amortize one-shot allocations (module init,
    // lazy route compilation, etc.) before we take the baseline.
    {
      const { router, unsubscribe } = createStressRouter({
        maxHistoryLength: 50,
      });

      await router.start("/");
      await router.navigate("users");
      router.stop();
      unsubscribe();
    }

    (globalThis as { gc?: () => void }).gc?.();

    const baselineHeap = process.memoryUsage().heapUsed;

    for (let cycle = 0; cycle < 1000; cycle++) {
      const { router, unsubscribe } = createStressRouter({
        maxHistoryLength: 50,
      });

      await router.start("/");
      await router.navigate("users");
      await router.navigate("user", { id: String(cycle) });
      await router.navigate("settings");
      await router.navigate("profile");
      await router.navigate("home");
      router.stop();
      unsubscribe();
    }

    (globalThis as { gc?: () => void }).gc?.();

    const finalHeap = process.memoryUsage().heapUsed;
    const growthRatio = finalHeap / baselineHeap;

    // Very loose upper bound. See comment at top of file.
    expect(growthRatio).toBeLessThan(25);
  });

  it("S13.2: single long-lived router with 10 000 navigations respects maxHistoryLength", async () => {
    const { router, unsubscribe } = createStressRouter({
      maxHistoryLength: 100,
    });

    try {
      await router.start("/");

      for (let i = 0; i < 10_000; i++) {
        await router.navigate("user", { id: String(i) });
      }

      // History cap is 100 — historyIndex must be exactly 99 after the last push.
      const memory = router.getState()?.context.memory as
        | { historyIndex: number }
        | undefined;

      expect(memory?.historyIndex).toBe(99);

      // canGoBack must report a bounded number of back-steps.
      let backSteps = 0;

      while (router.canGoBack() && backSteps < 200) {
        router.back();
        await new Promise<void>((r) => setTimeout(r, 0));
        backSteps++;
      }

      expect(backSteps).toBe(99);
    } finally {
      router.stop();
      unsubscribe();
    }
  });
});
