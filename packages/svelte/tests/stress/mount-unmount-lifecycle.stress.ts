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

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  });

  it("3.2: mount/unmount useRoute × 100 cycles — bounded heap", () => {
    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const { unmount } = renderWithRouter(router, StressRouteConsumer, {});

      unmount();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
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
