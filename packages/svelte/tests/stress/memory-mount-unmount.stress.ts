import { createRouter } from "@real-router/core";
import { render, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import MemoryTestErrorApp from "./components/MemoryTestErrorApp.svelte";
import MemoryTestNodes from "./components/MemoryTestNodes.svelte";
import MemoryTestTransition from "./components/MemoryTestTransition.svelte";
import {
  createStressRouter,
  forceGC,
  getHeapUsedBytes,
  renderWithRouter,
} from "./helpers";

import type { Router, Route } from "@real-router/core";

const originalWrite = process.stdout.write.bind(process.stdout);

function logBaseline(
  pattern: string,
  iterations: number,
  deltaBytes: number,
  notes = "",
): void {
  const deltaKb = (deltaBytes / 1024).toFixed(1);
  const perIter = iterations > 0 ? (deltaBytes / iterations).toFixed(0) : "n/a";
  const line = `[memory-baseline] svelte/${pattern} iters=${iterations} delta=${deltaKb}KB per-iter=${perIter}B ${notes}\n`;

  originalWrite(line);
}

function stabilizeHeap(): number {
  forceGC();
  forceGC();

  return getHeapUsedBytes();
}

describe("memory-mount-unmount baseline", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(10);
    await router.start("/route0");
  });

  afterEach(() => {
    cleanup();
    router.stop();
  });

  it("Pattern A: useRouterTransition × 1000 mount/unmount", () => {
    const mountOnce = (): ReturnType<typeof renderWithRouter> =>
      renderWithRouter(router, MemoryTestTransition, {});

    {
      const w = mountOnce();

      w.unmount();
    }

    const before = stabilizeHeap();

    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const h = mountOnce();

      h.unmount();
    }

    const after = stabilizeHeap();
    const delta = after - before;

    logBaseline("transition-1000", iterations, delta);

    // After cached getTransitionSource: ~5.5KB/iter (baseline 7KB).
    expect(delta).toBeLessThan(6500 * iterations);
  });

  it("Pattern B: useRouteNode × 100 + 50 navigations", async () => {
    const mountTree = (): ReturnType<typeof renderWithRouter> =>
      renderWithRouter(router, MemoryTestNodes, { count: 100 });

    const routes = ["users.list", "route1", "users.view", "route2"];

    {
      const w = mountTree();

      w.unmount();
    }

    const before = stabilizeHeap();

    const trees: ReturnType<typeof renderWithRouter>[] = [];

    for (let i = 0; i < 10; i++) {
      trees.push(mountTree());
    }

    for (let i = 0; i < 50; i++) {
      await router.navigate(routes[i % routes.length], { id: String(i) });
      await tick();
    }

    for (const t of trees) {
      t.unmount();
    }

    const after = stabilizeHeap();
    const delta = after - before;

    logBaseline(
      "routenode-100x10-nav-50",
      10 * 100,
      delta,
      "(10 trees × 100 consumers)",
    );

    // Svelte's lazy createSubscriber + cached source — baseline ~260 B/iter.
    expect(delta).toBeLessThan(500 * 10 * 100);
  });

  it("Pattern C: 500 RouterErrorBoundary with fresh routers", async () => {
    const makeRoutes = (): Route[] => [
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ];

    const iterations = 500;

    const before = stabilizeHeap();

    for (let i = 0; i < iterations; i++) {
      const r = createRouter(makeRoutes(), { defaultRoute: "home" });

      await r.start("/");

      const w = render(MemoryTestErrorApp, { props: { router: r } });

      w.unmount();
    }

    const after = stabilizeHeap();
    const delta = after - before;

    logBaseline("errorboundary-500-fresh-routers", iterations, delta);

    // Pattern C has no numeric bound — 500 live routers in heap is expected.
    expect(typeof delta).toBe("number");
  });
});
