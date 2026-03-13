import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import {
  createDeepRouteTree,
  createFlatRoutes,
  createParamRoutes,
  createStressRouter,
  measureTime,
} from "./helpers";

describe("S6: Route tree scaling", () => {
  it("S6.1: Flat 500 routes — buildPath + matchPath correct, avg < 1ms per pair", () => {
    const router = createStressRouter(500);

    router.start("/route0").catch(() => {});

    const pluginApi = getPluginApi(router);
    let elapsed = 0;

    for (let i = 0; i < 500; i++) {
      const { result: path, durationMs: buildMs } = measureTime(() =>
        router.buildPath(`route${i}`),
      );

      const { result: match, durationMs: matchMs } = measureTime(() =>
        pluginApi.matchPath(path),
      );

      elapsed += buildMs + matchMs;

      expect(match?.name).toBe(`route${i}`);
    }

    expect(elapsed / 500).toBeLessThan(1);

    router.stop();
    router.dispose();
  });

  it("S6.2: Deep tree depth=6 x breadth=4 — navigate to deepest leaf, state correct", async () => {
    const routes = createDeepRouteTree(6, 4);
    const router = createRouter(routes, { defaultRoute: "level0_0" });

    await router.start("/level0_0");

    const leafName = "level0_0.level1_0.level2_0.level3_0.level4_0.level5_0";

    await router.navigate(leafName);

    expect(router.getState()?.name).toBe(leafName);

    router.stop();
    router.dispose();
  });

  it("S6.3: Wide 200 flat + Deep 5 levels x 4 children (~1564 routes) — buildPath/matchPath for all leaves", async () => {
    const flatRoutes = createFlatRoutes(200);
    const deepRoutes = createDeepRouteTree(5, 4);
    const router = createRouter([...flatRoutes, ...deepRoutes], {
      defaultRoute: "route0",
    });

    await router.start("/route0");

    const pluginApi = getPluginApi(router);

    for (let i = 0; i < 200; i++) {
      const path = router.buildPath(`route${i}`);
      const match = pluginApi.matchPath(path);

      expect(match?.name).toBe(`route${i}`);
    }

    const deepLeaves = [
      "level0_0.level1_0.level2_0.level3_0.level4_0",
      "level0_0.level1_0.level2_0.level3_0.level4_3",
      "level0_0.level1_0.level2_0.level3_3.level4_0",
      "level0_1.level1_0.level2_0.level3_0.level4_0",
      "level0_2.level1_1.level2_0.level3_0.level4_0",
      "level0_3.level1_0.level2_0.level3_0.level4_0",
    ];

    for (const leafName of deepLeaves) {
      const path = router.buildPath(leafName);
      const match = pluginApi.matchPath(path);

      expect(match?.name).toBe(leafName);
    }

    router.stop();
    router.dispose();
  });

  it("S6.4: 200 routes with /:param — matchPath returns correct params for all", async () => {
    const routes = createParamRoutes(200);
    const router = createRouter(routes, { defaultRoute: "routeP0" });

    await router.start("/routeP0/start");

    const pluginApi = getPluginApi(router);

    for (let i = 0; i < 200; i++) {
      const path = `/routeP${i}/value${i}`;
      const match = pluginApi.matchPath(path);

      expect(match?.name).toBe(`routeP${i}`);
      expect(match?.params).toStrictEqual(
        expect.objectContaining({ id: `value${i}` }),
      );
    }

    router.stop();
    router.dispose();
  });

  it("S6.5: Route replacement 100 cycles — state valid after each replace", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const routesApi = getRoutesApi(router);

    for (let i = 0; i < 100; i++) {
      const newRoutes = createFlatRoutes(10 + (i % 5));

      routesApi.replace(newRoutes);

      await router.navigate(`route${i % 5}`).catch(() => {});

      expect(router.getState()).toBeDefined();
    }

    router.stop();
    router.dispose();
  });
});
