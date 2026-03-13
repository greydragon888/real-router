import { describe, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

import { createDeepRouteTree, createFlatRoutes, measureTime } from "./helpers";

import type { Router } from "@real-router/core";

describe("S22: isActiveRoute performance", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S22.1: isActiveRoute() × 10,000 on 500-route tree — avg < 0.1ms", async () => {
    const routes = createFlatRoutes(500);

    router = createRouter(routes, { defaultRoute: "route0" });
    await router.start("/route0");

    await router.navigate("route250");

    let elapsed = 0;

    for (let i = 0; i < 10_000; i++) {
      const routeName = `route${i % 500}`;
      const { result, durationMs } = measureTime(() =>
        router.isActiveRoute(routeName),
      );

      elapsed += durationMs;

      if (routeName === "route250") {
        expect(result).toBe(true);
      }
    }

    expect(elapsed / 10_000).toBeLessThan(0.1);
  }, 30_000);

  it("S22.2: isActiveRoute() with strictEquality on deep tree", async () => {
    const routes = createDeepRouteTree(5, 4);

    router = createRouter(routes, { defaultRoute: "level0_0" });
    await router.start("/level0_0");

    const leafName = "level0_0.level1_0.level2_0.level3_0.level4_0";

    await router.navigate(leafName);

    let trueCount = 0;
    let falseCount = 0;

    for (let i = 0; i < 5000; i++) {
      const strict = i % 2 === 0;

      const isActive = router.isActiveRoute("level0_0", {}, strict);

      if (isActive) {
        trueCount++;
      } else {
        falseCount++;
      }
    }

    expect(trueCount).toBeGreaterThan(0);
    expect(falseCount).toBeGreaterThan(0);
  }, 30_000);

  it("S22.3: isActiveRoute() with ignoreQueryParams", async () => {
    const routes = createFlatRoutes(100);

    router = createRouter(routes, { defaultRoute: "route0" });
    await router.start("/route0");

    await router.navigate("route50", { query: "test" });

    let matchWithQuery = 0;
    let matchIgnoreQuery = 0;

    for (let i = 0; i < 5000; i++) {
      const ignoreQuery = i % 2 === 0;

      const isActive = router.isActiveRoute(
        "route50",
        { query: "other" },
        false,
        ignoreQuery,
      );

      if (isActive) {
        if (ignoreQuery) {
          matchIgnoreQuery++;
        } else {
          matchWithQuery++;
        }
      }
    }

    expect(matchIgnoreQuery).toBeGreaterThan(0);
    expect(matchWithQuery).toBe(0);
  }, 30_000);
});
