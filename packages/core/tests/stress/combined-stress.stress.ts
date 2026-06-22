import { describe, it, expect } from "vitest";

import {
  cloneRouter,
  getLifecycleApi,
  getRoutesApi,
} from "@real-router/core/api";

import {
  createFlatRoutes,
  createStressRouter,
  formatBytes,
  fullPluginFactory,
  MB,
  noopPluginFactory,
  takeHeapSnapshot,
} from "./helpers";

const createFullPlugin = () => () => fullPluginFactory();

const alwaysAllowGuardFn = () => true;

const alwaysAllowGuard = () => alwaysAllowGuardFn;

describe("S9: Combined load scenarios", () => {
  it("S9.1: SPA simulation — 50 routes, 5 plugins, 10 guards, 20 listeners, 500 navigations", async () => {
    const router = createStressRouter(50);

    for (let i = 0; i < 5; i++) {
      router.usePlugin(createFullPlugin());
    }

    const lifecycle = getLifecycleApi(router);

    for (let i = 0; i < 10; i++) {
      lifecycle.addActivateGuard(`route${i}`, alwaysAllowGuard);
    }

    const unsubs: (() => void)[] = [];

    for (let i = 0; i < 20; i++) {
      unsubs.push(
        router.subscribe(() => {
          /* noop */
        }),
      );
    }

    await router.start("/route0");

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 500; i++) {
      await router.navigate(`route${(i % 49) + 1}`);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    // Last navigation (i=499): route${(499 % 49) + 1} = route10. Asserting the
    // exact landing route discriminates a navigation regression under full SPA
    // load that the old `toBeDefined()` would miss. Heap ceiling is a
    // throughput/catastrophe guard — on a persistent router the per-nav
    // state-retention leak is validated discriminatingly by guards-stress S5.3
    // (N=20k); here N=500 keeps that signal in the noise.
    expect(router.getState()?.name).toBe("route10");
    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(2 * MB);

    for (const unsub of unsubs) {
      unsub();
    }

    router.stop();
    router.dispose();
  }, 60_000);

  it("S9.2: SSR clone storm — cloneRouter × 200, each navigate + dispose", async () => {
    const router = createStressRouter(20);

    await router.start("/route0");

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      const clone = cloneRouter(router);
      const target = `route${(i % 19) + 1}`;

      await clone.start("/route0");
      await clone.navigate(target);

      // Each clone resolves its own navigation independently — discriminates a
      // clone-wiring regression the bare heap ceiling can't (create→dispose
      // loop is GC-masked, so the heap line below is a throughput guard only).
      expect(clone.getState()?.name).toBe(target);

      clone.stop();
      clone.dispose();
    }

    // ...and 200 clone+dispose cycles never perturb the source router (the whole
    // point of SSR cloning — clones are isolated from the template).
    expect(router.getState()?.name).toBe("route0");

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    router.stop();
    router.dispose();

    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(4 * MB);
  }, 60_000);

  it("S9.3: Hot reload simulation — 50 replace cycles, navigate after each, state stays tree-consistent", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const routesApi = getRoutesApi(router);

    for (let i = 0; i < 50; i++) {
      const newRoutes = createFlatRoutes(10 + (i % 5));

      routesApi.replace(newRoutes);

      await router.navigate(`route${i % 5}`).catch(() => {});

      // After a hot-reload replace + navigate, the committed state must still
      // resolve to a real route in the *new* tree. The old `toBeDefined()`
      // passed even if state.name dangled at a route the replace removed.
      const state = router.getState();

      expect(state && routesApi.has(state.name)).toBe(true);
    }

    router.stop();
    router.dispose();
  }, 30_000);

  it("S9.4: Mount/unmount storm — 100 create/start/navigate/stop/dispose cycles", async () => {
    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
      const r = createStressRouter(10);
      const target = `route${(i % 9) + 1}`;

      r.usePlugin(noopPluginFactory);
      await r.start("/route0");
      await r.navigate(target);

      // Each lifecycle actually advances state to the target...
      expect(r.getState()?.name).toBe(target);

      r.stop();
      r.dispose();

      // ...and dispose really terminates the router (mutating it now throws).
      let disposedThrew = false;

      try {
        await r.navigate("route0");
      } catch {
        disposedThrew = true;
      }

      expect(disposedThrew).toBe(true);
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    // Create→dispose loop is GC-masked (each router is dropped, reclaimed
    // regardless of dispose correctness) — this heap line is a throughput guard;
    // dispose correctness is asserted by the disposed-throws check above.
    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(2 * MB);
  }, 60_000);
});
