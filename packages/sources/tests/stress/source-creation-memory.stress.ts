import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createRouteSource,
  createRouteNodeSource,
  createActiveRouteSource,
  createTransitionSource,
} from "@real-router/sources";

import {
  createStressRouter,
  takeHeapSnapshot,
  createManySources,
  MB,
} from "./helpers";

import type { Router } from "@real-router/core";

describe("S2: Source creation storm + memory", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("S2.1: Create 500 RouteSource → destroy all → heap returns to baseline", () => {
    const baseline = takeHeapSnapshot();

    const sources = createManySources(() => createRouteSource(router), 500);

    sources.forEach((s) => s.subscribe(() => {}));
    sources.forEach((s) => {
      s.destroy();
    });

    const after = takeHeapSnapshot();

    expect(after - baseline).toBeLessThan(MB);
  });

  it("S2.2: Create 500 RouteNodeSource → destroy all → heap returns to baseline", () => {
    const baseline = takeHeapSnapshot();

    const sources = createManySources(
      () => createRouteNodeSource(router, "users"),
      500,
    );

    sources.forEach((s) => s.subscribe(() => {}));
    sources.forEach((s) => {
      s.destroy();
    });

    const after = takeHeapSnapshot();

    expect(after - baseline).toBeLessThan(MB);
  });

  it("S2.3: Create 500 ActiveRouteSource → navigate × 50 → destroy all → heap returns to baseline", async () => {
    const baseline = takeHeapSnapshot();

    const sources = createManySources(
      () => createActiveRouteSource(router, "home"),
      500,
    );

    const routes = ["users.list", "about", "admin.dashboard", "home"];

    for (let i = 0; i < 50; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    sources.forEach((s) => {
      s.destroy();
    });

    const after = takeHeapSnapshot();

    expect(after - baseline).toBeLessThan(MB);
  });

  it("S2.4: Create 200 TransitionSource → navigate × 50 → destroy all → heap returns to baseline", async () => {
    const baseline = takeHeapSnapshot();

    const sources = createManySources(
      () => createTransitionSource(router),
      200,
    );

    const routes = ["users.list", "about", "admin.dashboard", "home"];

    for (let i = 0; i < 50; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    sources.forEach((s) => {
      s.destroy();
    });

    const after = takeHeapSnapshot();

    expect(after - baseline).toBeLessThan(MB);
  });

  it("S2.5: 100 cycles of create 10 sources → navigate → destroy show no monotonic heap growth", async () => {
    const routes = ["users.list", "about", "admin.dashboard", "home"];
    const snapshots: number[] = [];

    for (let cycle = 0; cycle < 100; cycle++) {
      const routeSources = createManySources(
        () => createRouteSource(router),
        2,
      );

      routeSources.forEach((s) => s.subscribe(() => {}));

      const nodeSources = createManySources(
        () => createRouteNodeSource(router, "users"),
        3,
      );

      nodeSources.forEach((s) => s.subscribe(() => {}));

      const activeSources = createManySources(
        () => createActiveRouteSource(router, "home"),
        3,
      );

      const transitionSources = createManySources(
        () => createTransitionSource(router),
        2,
      );

      await router.navigate(routes[cycle % routes.length]);

      const allSources = [
        ...routeSources,
        ...nodeSources,
        ...activeSources,
        ...transitionSources,
      ];

      allSources.forEach((s) => {
        s.destroy();
      });

      if ((cycle + 1) % 25 === 0) {
        snapshots.push(takeHeapSnapshot());
      }
    }

    expect(snapshots).toHaveLength(4);

    const maxHeap = Math.max(...snapshots);
    const minHeap = Math.min(...snapshots);

    expect(maxHeap - minHeap).toBeLessThan(MB);
  });
});
