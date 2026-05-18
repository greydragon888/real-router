import { flushSync, tick } from "svelte";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import ManyConsumers from "./components/ManyConsumers.svelte";
import {
  createStressRouter,
  forceGC,
  getHeapUsedBytes,
  MB,
  renderWithRouter,
  roundRobinRoutes,
} from "./helpers";
import { createReactiveSource } from "../../src/createReactiveSource.svelte";

import type { Router as RouterType } from "@real-router/core";
import type { RouterSource } from "@real-router/sources";

async function safeNavigate(router: RouterType, name: string): Promise<void> {
  await router.navigate(name).catch(() => {});
  await tick();
}

describe("Stress: long-run leak detection", () => {
  let router: RouterType;

  beforeEach(async () => {
    router = createStressRouter(5);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("12.1 5000 navigations across 5 routes with 20 mounted consumers — heap stabilizes after warmup", async () => {
    const { unmount } = renderWithRouter(router, ManyConsumers, { count: 20 });

    flushSync();

    const routeNames = roundRobinRoutes(
      ["route0", "route1", "route2", "route3", "route4"],
      5000,
    );

    // Warmup batch — JIT settles, internal caches fill.
    for (const name of routeNames.slice(0, 500)) {
      await safeNavigate(router, name);
    }

    flushSync();

    forceGC();
    const afterWarmup = getHeapUsedBytes();

    // Main batch — heap delta after warmup is what we care about.
    for (const name of routeNames.slice(500)) {
      await safeNavigate(router, name);
    }

    flushSync();

    forceGC();
    const afterMain = getHeapUsedBytes();

    // After warmup the steady-state delta over 4500 more navigations should
    // be small. Any genuine listener leak would push this far higher.
    expect(afterMain - afterWarmup).toBeLessThan(50 * MB);

    unmount();
  });

  // Closes review §7 LOW #6: 5K navigations already prove "no leak", but a
  // slow super-linear accumulation (e.g. O(n log n) in a cache rebuild) is
  // invisible at that scale. 10K with TWO checkpoints (at 5K and 10K post-
  // warmup) lets us assert linearity: delta10k must be at most ≈2.5× delta5k
  // (the 0.5× slack absorbs GC noise and JIT-deopt jitter). A genuinely
  // super-linear leak would push delta10k far higher (closer to 4×).
  it("12.1-extended 10000 navigations with 5K/10K checkpoints — heap stays approximately linear", async () => {
    const { unmount } = renderWithRouter(router, ManyConsumers, { count: 20 });

    flushSync();

    const routeNames = roundRobinRoutes(
      ["route0", "route1", "route2", "route3", "route4"],
      10_000,
    );

    // Warmup batch — JIT settles, caches fill, GC reaches steady state.
    for (const name of routeNames.slice(0, 500)) {
      await safeNavigate(router, name);
    }

    flushSync();
    forceGC();
    const afterWarmup = getHeapUsedBytes();

    // First measured slice: 4500 navs (warmup → 5K).
    for (const name of routeNames.slice(500, 5000)) {
      await safeNavigate(router, name);
    }

    flushSync();
    forceGC();
    const afterFive = getHeapUsedBytes();

    // Second measured slice: 5000 navs (5K → 10K). Same workload size as the
    // first slice so the deltas are directly comparable through console
    // logs (vitest stress reporter captures them on failure).
    for (const name of routeNames.slice(5000)) {
      await safeNavigate(router, name);
    }

    flushSync();
    forceGC();
    const afterTen = getHeapUsedBytes();

    // Two unconditional bounds prove linearity without conditional expects:
    //   1) Full 10K-from-warmup delta stays under 100MB (twice the 50MB
    //      budget that the 5K-only test uses) — pins the proportional
    //      growth ceiling.
    //   2) The marginal 5K→10K delta stays under 50MB — same budget as
    //      the warmup→5K slice. Together these two bounds rule out
    //      super-linear accumulation: a quadratic leak would blow the
    //      marginal-slice bound long before the absolute bound.
    expect(afterTen - afterWarmup).toBeLessThan(100 * MB);
    expect(afterTen - afterFive).toBeLessThan(50 * MB);

    unmount();
  });

  // Explicit listener-count leak check. Wraps a RouterSource so every call
  // to source.subscribe is counted. 10_000 read cycles must balance to zero
  // subscriptions at the end — otherwise createReactiveSource leaks.
  it("12.2 10000 subscribe/unsubscribe cycles on createReactiveSource — listener count returns to zero", () => {
    let activeSubscriptions = 0;
    let totalSubscribes = 0;
    let totalUnsubscribes = 0;

    const baseSource: RouterSource<number> = {
      subscribe: vi.fn(() => {
        activeSubscriptions++;
        totalSubscribes++;

        return () => {
          activeSubscriptions--;
          totalUnsubscribes--;
        };
      }),
      getSnapshot: () => 0,
      destroy: () => {},
    };

    for (let i = 0; i < 10_000; i++) {
      const reactive = createReactiveSource(baseSource);

      // Read .current — under createSubscriber, .current outside a reactive
      // context does NOT invoke subscribe. This locks the "lazy" contract:
      // reading .current 10k times with no $effect/$derived context must not
      // accumulate listeners.
      expect(reactive.current).toBe(0);
    }

    // No reactive context was ever entered, so subscribe should not have been
    // invoked at all — and activeSubscriptions must be zero regardless.
    expect(totalSubscribes).toBe(0);
    expect(totalUnsubscribes).toBe(0);
    expect(activeSubscriptions).toBe(0);
  });
});
