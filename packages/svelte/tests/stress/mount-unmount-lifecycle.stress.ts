import { tick } from "svelte";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import StressConsumer from "./components/StressConsumer.svelte";
import StressRouteConsumer from "./components/StressRouteConsumer.svelte";
import StressLink from "./components/StressLink.svelte";
import ManyConsumers from "./components/ManyConsumers.svelte";

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

  it("3.4: Link mount/unmount × 100 cycles — no crashes", () => {
    for (let i = 0; i < 100; i++) {
      const { unmount } = renderWithRouter(router, StressLink, {
        routeName: "route0",
        testId: "test-link",
      });

      unmount();
    }

    const { unmount, container } = renderWithRouter(router, StressLink, {
      routeName: "route1",
      testId: "final-link",
    });

    const link = container.querySelector("a");

    expect(link).toBeTruthy();

    unmount();
  });

  it("3.5: StressLinkAction mount/unmount × 100 cycles — no crashes", async () => {
    const { default: StressLinkAction } = await import(
      "./components/StressLinkAction.svelte"
    );

    for (let i = 0; i < 100; i++) {
      const { unmount } = renderWithRouter(router, StressLinkAction, {
        routeName: "route0",
        testId: "test-action",
      });

      unmount();
    }

    const { unmount, container } = renderWithRouter(router, StressLinkAction, {
      routeName: "route1",
      testId: "final-action",
    });

    const div = container.querySelector("[data-testid='final-action']");

    expect(div).toBeTruthy();
    expect(div?.getAttribute("role")).toBe("link");

    unmount();
  });
});
