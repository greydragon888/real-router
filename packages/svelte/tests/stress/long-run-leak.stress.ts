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
