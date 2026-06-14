import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { createStressRouter, noop } from "./helpers";

/**
 * S13.1 is a GROSS-LEAK / THROUGHPUT guard, not a per-cycle teardown probe.
 *
 * The loop creates a NEW router each cycle and drops it. An unreferenced
 * router is reclaimed by GC regardless of whether its `teardown()`/`stop()`/
 * `unsubscribe()` actually released anything, so a per-cycle cleanup leak is
 * structurally invisible to a heap snapshot here (GC-masked). This test
 * therefore CANNOT prove per-cycle cleanup correctness — that is covered by
 * the functional teardown unit tests (tests/functional/*: onStop clears
 * history, teardown removes extensions + clears).
 *
 * What it CAN catch: a gross, process-global accumulation across 1000 cycles
 * (e.g. a module-level registry that retains every router, a global listener
 * array that never releases) — those survive GC and show up as absolute heap
 * growth over the baseline.
 *
 * Threshold is anchored to a MEASURED healthy delta, not a round MB guess:
 *   measured healthy delta over baseline (3× isolated runs, --expose-gc):
 *     min 1.117 MB / med 1.118 MB / max 1.119 MB  (baseline ~13.2–13.9 MB).
 * THRESHOLD = 12 MB ≈ 10× max-observed-healthy (≥3× margin required → satisfied),
 * so the gate trips on a multi-MB gross leak while staying clear of normal
 * JIT/allocation noise.
 *
 * NOTE: a ratio metric (finalHeap/baselineHeap) was previously used here and
 * was non-discriminating — healthy ratio is ~1.08, so a ratio<25 gate only
 * trips at ~330 MB. The absolute-delta assertion below replaces it.
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

    // Absolute gross-leak / throughput guard. Threshold = 12 MB ≈ 10× the
    // measured healthy delta (~1.12 MB). See comment at top of file for why a
    // ratio metric was non-discriminating and why per-cycle leaks are
    // GC-masked here.
    const MB = 1024 * 1024;

    expect(finalHeap - baselineHeap).toBeLessThan(12 * MB);
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
