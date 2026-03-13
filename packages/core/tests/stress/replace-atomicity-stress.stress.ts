import { describe, afterEach, it, expect } from "vitest";

import { getRoutesApi, getPluginApi } from "@real-router/core/api";

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
  });

  it("S25.1: replace() during active navigation — silent no-op, navigation completes", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    const routesApi = getRoutesApi(router);
    const newRoutes = createFlatRoutes(5);

    const navigatePromise = router.navigate("route5");

    // replace() during active transition should be a silent no-op
    routesApi.replace(newRoutes);

    const state = await navigatePromise;

    expect(state.name).toBe("route5");
    expect(router.isActive()).toBe(true);
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

  it("S25.3: 100 replace() cycles — heap stable", async () => {
    router = createStressRouter(10);
    await router.start("/route0");

    const routesApi = getRoutesApi(router);

    const before = takeHeapSnapshot();

    for (let i = 0; i < 100; i++) {
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
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(5 * MB);
  });
});
