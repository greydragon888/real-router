import { tick } from "svelte";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import ManyConsumers from "./components/ManyConsumers.svelte";
import StressConsumer from "./components/StressConsumer.svelte";
import StressRouteConsumer from "./components/StressRouteConsumer.svelte";
import {
  createStressRouter,
  renderWithRouter,
  takeHeapSnapshot,
  MB,
} from "./helpers";

import type { Router } from "@real-router/core";

describe("mount/unmount subscription lifecycle (Svelte)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("3.1: mount/unmount useRouteNode × 100 cycles — bounded heap", () => {
    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const { unmount } = renderWithRouter(router, StressConsumer, {
        nodeName: "route0",
      });

      unmount();
    }

    const heapAfter = takeHeapSnapshot();

    // Throughput guard (GC-masked): each cycle mounts then unmounts, refs
    // dropped — a per-cycle subscription leak is reclaimed by GC and invisible
    // to this snapshot. Real per-cycle cleanup is proven by the functional
    // mount/unmount tests (3.3) and start-stop-churn's listener-count probe.
    // Threshold = ~9x measured healthy (~1.64MB over 100 cycles); catches a
    // gross regression only.
    expect(heapAfter - heapBefore).toBeLessThan(15 * MB);
  });

  it("3.2: mount/unmount useRoute × 100 cycles — bounded heap", () => {
    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const { unmount } = renderWithRouter(router, StressRouteConsumer, {});

      unmount();
    }

    const heapAfter = takeHeapSnapshot();

    // Throughput guard (GC-masked): mount→unmount loop, refs dropped per cycle.
    // Threshold = ~9x measured healthy (~1.63MB over 100 cycles).
    expect(heapAfter - heapBefore).toBeLessThan(15 * MB);
  });

  it("3.3: 30 components mount → 10 navs → unmount → remount → 10 navs", async () => {
    const renders: number[] = Array.from({ length: 30 }, () => 0);
    const onRenders = renders.map((_, i) => () => {
      renders[i]++;
    });

    const { unmount } = renderWithRouter(router, ManyConsumers, {
      count: 30,
      onRenders,
    });

    await tick();

    for (let i = 0; i < 10; i++) {
      await router.navigate(`route${i + 1}`);
      await tick();
    }

    renders.forEach((count) => {
      expect(count).toBeGreaterThan(0);
    });

    unmount();
    renders.fill(0);

    const { unmount: unmount2 } = renderWithRouter(router, ManyConsumers, {
      count: 30,
      onRenders,
    });

    await tick();

    for (let i = 0; i < 10; i++) {
      await router.navigate(`route${i % 10}`);
      await tick();
    }

    renders.forEach((count) => {
      expect(count).toBeGreaterThan(0);
    });

    unmount2();
  });
});
