import { describe, afterEach, it, expect, vi } from "vitest";

import {
  getRoutesApi,
  getPluginApi,
  getLifecycleApi,
} from "@real-router/core/api";

import {
  createFlatRoutes,
  createStressRouter,
  formatBytes,
  MB,
  takeHeapSnapshot,
} from "./helpers";

import type { Router } from "@real-router/core";

describe("S25: replace() atomicity under concurrent navigation", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
    vi.restoreAllMocks();
  });

  it("S25.1: replace() during active navigation — silent no-op, navigation completes", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    const routesApi = getRoutesApi(router);
    const lifecycle = getLifecycleApi(router);
    const newRoutes = createFlatRoutes(5);

    // The blocked replace() logs an error — silence it so the stress run stays
    // clean while still asserting the no-op via the return value.
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    // Park the navigation in an async activation guard so it is genuinely
    // in-flight (isTransitioning() === true) when replace() runs. A guard-free
    // navigate("route5") resolves SYNCHRONOUSLY before replace(), so the
    // "during active navigation" precondition would never hold — replace() would
    // actually execute and the old assertions (name === "route5", isActive())
    // passed whether or not replace() was a no-op (S25.1 theatre, audit N-5).
    let releaseGuard!: () => void;

    lifecycle.addActivateGuard(
      "route5",
      () => () =>
        new Promise<boolean>((resolve) => {
          releaseGuard = () => {
            resolve(true);
          };
        }),
    );

    const navigatePromise = router.navigate("route5");

    // Let the navigation reach and park in its (pending) guard await.
    await Promise.resolve();

    // replace() during an active transition is a logged no-op
    // (validateClearRoutes → logger.error, early `return`). Its return value is
    // void whether it swaps or no-ops, so the no-op is proven STRUCTURALLY below
    // (route9 still resolves), not via the return value.
    routesApi.replace(newRoutes);

    // Release the guard so the parked navigation completes against the UNCHANGED
    // 10-route tree.
    releaseGuard();

    const state = await navigatePromise;

    expect(state.name).toBe("route5");
    expect(router.isActive()).toBe(true);

    // DISCRIMINATING: route9 exists ONLY in the original 10-route tree (the
    // rejected replace had just 5 routes). Navigating to it proves replace() did
    // NOT swap the tree — had the no-op failed, route9 would be gone.
    const after = await router.navigate("route9");

    expect(after.name).toBe("route9");
  });

  it("S25.2: 200 replace() cycles with navigation between each — state consistent", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    const routesApi = getRoutesApi(router);
    const pluginApi = getPluginApi(router);

    for (let i = 0; i < 200; i++) {
      const routeCount = 5 + (i % 6);
      const newRoutes = createFlatRoutes(routeCount);

      routesApi.replace(newRoutes);

      const currentName = router.getState()?.name;
      const targetIndex = (i % (routeCount - 1)) + 1;
      const targetRoute =
        `route${targetIndex}` === currentName
          ? `route${(targetIndex + 1) % routeCount}`
          : `route${targetIndex}`;

      await router.navigate(targetRoute);

      const state = router.getState();

      expect(state).toBeDefined();
      expect(state!.name).toBe(targetRoute);

      const path = router.buildPath(targetRoute);
      const matched = pluginApi.matchPath(path);

      expect(matched).toBeDefined();
      expect(matched!.name).toBe(targetRoute);
    }
  });

  it("S25.3: 3000 replace() cycles — heap stable", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    const routesApi = getRoutesApi(router);

    const before = takeHeapSnapshot();

    for (let i = 0; i < 3000; i++) {
      const routeCount = 10 + (i % 5);
      const newRoutes = createFlatRoutes(routeCount);

      routesApi.replace(newRoutes);

      const currentName = router.getState()?.name;
      const target = `route${(i % (routeCount - 1)) + 1}`;
      const targetRoute =
        target === currentName
          ? `route${((i + 2) % (routeCount - 1)) + 1}`
          : target;

      await router.navigate(targetRoute);

      // Each replace+navigate must land on the rebuilt target route — the
      // discriminating invariant the old heap-only assert lacked.
      expect(router.getState()?.name).toBe(targetRoute);
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    // Throughput guard: replace() rebuilds the tree (old tree GC'd, last-write-
    // wins), so accumulation is hard-capped to one generation and a heap snapshot
    // can't discriminate it; the per-cycle landing check above does.
    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(1.8 * MB);
  });
});
