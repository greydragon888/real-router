import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  createStressRouter,
  forceGC,
  getHeapUsedBytes,
  MB,
  renderWithRouter,
} from "./helpers";
import LazyTest from "../helpers/LazyTest.svelte";
import MockFallbackComponent from "../helpers/MockFallbackComponent.svelte";
import MockLoadedComponent from "../helpers/MockLoadedComponent.svelte";

import type { Router } from "@real-router/core";
import type { Component } from "svelte";

type Loader = () => Promise<{ default: Component }>;

describe("Stress: Lazy.svelte", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(2);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("9.1 Concurrent mount + immediate unmount of 30 Lazy components — no leaked timers, no setState-after-unmount", async () => {
    forceGC();
    const baselineHeap = getHeapUsedBytes();
    const renders: { unmount: () => void }[] = [];
    const resolvers: ((value: { default: Component }) => void)[] = [];

    for (let i = 0; i < 30; i++) {
      const loader: Loader = () =>
        new Promise<{ default: Component }>((resolve) => {
          resolvers.push(resolve);
        });

      const r = renderWithRouter(router, LazyTest, {
        router,
        loader,
        fallback: MockFallbackComponent,
      });

      renders.push(r);
    }

    flushSync();

    // Unmount all before any loader resolves — pending promises must be ignored
    // (state writes after unmount would throw "scope not registered" in Svelte 5).
    for (const r of renders) {
      r.unmount();
    }

    // Now resolve every pending loader — the discarded `active` flags should
    // gate every state assignment.
    for (const resolve of resolvers) {
      resolve({ default: MockLoadedComponent });
    }

    await Promise.resolve();
    flushSync();

    forceGC();
    const finalHeap = getHeapUsedBytes();

    // Heap delta should be small — no retained components or pending timers.
    expect(finalHeap - baselineHeap).toBeLessThan(50 * MB);
  });

  it("9.2 100 mount/unmount cycles of a single Lazy — bounded heap (no listener leak)", async () => {
    forceGC();
    const baseline = getHeapUsedBytes();

    for (let i = 0; i < 100; i++) {
      const loader: Loader = () =>
        Promise.resolve({ default: MockLoadedComponent });

      const r = renderWithRouter(router, LazyTest, {
        router,
        loader,
        fallback: MockFallbackComponent,
      });

      await Promise.resolve();
      flushSync();
      r.unmount();
    }

    forceGC();
    const final = getHeapUsedBytes();

    expect(final - baseline).toBeLessThan(50 * MB);
  });

  it("9.3 Many Lazy components mounted at once — every one ends in 'ready' state", async () => {
    const renders: { unmount: () => void; container: HTMLElement }[] = [];

    for (let i = 0; i < 30; i++) {
      const loader: Loader = () =>
        Promise.resolve({ default: MockLoadedComponent });

      const r = renderWithRouter(router, LazyTest, {
        router,
        loader,
        fallback: MockFallbackComponent,
      });

      renders.push(r);
    }

    // Allow microtask queue to drain so every loader resolves.
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }

    flushSync();

    // Each render shows "loaded" — none stuck in fallback.
    for (const r of renders) {
      expect(
        r.container.querySelector("[data-testid='loaded']"),
      ).not.toBeNull();
      expect(r.container.querySelector("[data-testid='fallback']")).toBeNull();
    }

    for (const r of renders) {
      r.unmount();
    }
  });
});
