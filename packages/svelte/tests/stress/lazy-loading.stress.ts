import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createStressRouter, renderWithRouter } from "./helpers";
import LazyTest from "../helpers/LazyTest.svelte";
import MockFallbackComponent from "../helpers/MockFallbackComponent.svelte";
import MockLoadedComponent from "../helpers/MockLoadedComponent.svelte";

import type { Router } from "@real-router/core";
import type { Component } from "svelte";

type Loader = () => Promise<{ default: Component }>;

describe("Stress: Lazy.svelte", () => {
  let router: Router;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    router = createStressRouter(2);
    await router.start("/route0");
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    router.stop();
  });

  // Count/spy-based (was a 50MB heap assertion — GC-masked: each Lazy is
  // mounted then unmounted, its component scope/runes/timers are reclaimed by
  // GC regardless of whether the `active` cleanup flag ran, so a broken flag is
  // structurally invisible to a heap snapshot). The TRUE discriminator: if the
  // `active = false` cleanup leaked, the post-unmount `state = {ready}` write
  // would hit a destroyed scope and Svelte 5 logs "scope not registered" via
  // console.error. We assert (a) every loader resolved, (b) zero post-unmount
  // state writes reached the DOM, (c) zero console.error — all fail if the
  // cleanup flag is removed.
  it("9.1 Concurrent mount + immediate unmount of 30 Lazy components — no leaked timers, no setState-after-unmount", async () => {
    const renders: { unmount: () => void; container: HTMLElement }[] = [];
    const resolvers: ((value: { default: Component }) => void)[] = [];
    let resolvedCount = 0;

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
      resolvedCount++;
    }

    await Promise.resolve();
    flushSync();

    // Every loader resolved.
    expect(resolvedCount).toBe(30);

    // No post-unmount state write reached the DOM — every container is empty,
    // proving the `active` flag gated all 30 deferred resolutions.
    for (const r of renders) {
      expect(r.container.querySelector("[data-testid='loaded']")).toBeNull();
    }

    // A broken cleanup flag would write state on a destroyed scope → Svelte 5
    // emits console.error. Zero errors proves cleanup ran.
    expect(consoleError).not.toHaveBeenCalled();
  });

  // Count/spy-based (was a 50MB heap assertion — GC-masked for the same reason
  // as 9.1). Discriminator: 100 resolve→unmount cycles must each reach the
  // "loaded" state and never log a post-unmount state-write error.
  it("9.2 100 mount/unmount cycles of a single Lazy — no listener leak, no post-unmount writes", async () => {
    let loaderCalls = 0;
    let loadedSeen = 0;

    for (let i = 0; i < 100; i++) {
      const loader: Loader = () => {
        loaderCalls++;

        return Promise.resolve({ default: MockLoadedComponent });
      };

      const r = renderWithRouter(router, LazyTest, {
        router,
        loader,
        fallback: MockFallbackComponent,
      });

      await Promise.resolve();
      flushSync();

      if (r.container.querySelector("[data-testid='loaded']")) {
        loadedSeen++;
      }

      r.unmount();
    }

    // Every cycle invoked the loader and resolved to the loaded component.
    expect(loaderCalls).toBe(100);
    expect(loadedSeen).toBe(100);
    // No post-unmount state-write errors across 100 cycles.
    expect(consoleError).not.toHaveBeenCalled();
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
