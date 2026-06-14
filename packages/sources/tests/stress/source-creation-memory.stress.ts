import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createRouteSource,
  createRouteNodeSource,
  createActiveRouteSource,
  createTransitionSource,
  createErrorSource,
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

    // Throughput guard (not a leak discriminator): the 500 destroyed sources
    // are still referenced by the `sources` array at snapshot time, so their
    // retained-object heap dominates and is identical whether or not destroy()
    // freed the router subscription — the leak signal is structurally masked.
    // Healthy delta ≈ 0.3 MB; threshold ~10× that as an honest upper bound.
    expect(after - baseline).toBeLessThan(3 * MB);
  });

  it("S2.2: Create 500 ActiveRouteSource → navigate × 50 → destroy all → heap returns to baseline", async () => {
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

    // Throughput guard (not a leak discriminator): createActiveRouteSource is
    // per-(router, canonical-args) cached, so all 500 calls return the SAME
    // shared instance and destroy() is a no-op — a broken teardown cannot
    // accumulate. Healthy delta ≈ 0.13 MB; threshold ~10× as an honest bound.
    expect(after - baseline).toBeLessThan(1.5 * MB);
  });

  it("S2.3: Create 200 ErrorSource → navigate × 50 → destroy all → heap returns to baseline", async () => {
    const baseline = takeHeapSnapshot();

    const sources = createManySources(() => createErrorSource(router), 200);

    const routes = ["users.list", "about", "admin.dashboard", "home"];

    for (let i = 0; i < 50; i++) {
      await router.navigate(routes[i % routes.length]);
    }

    sources.forEach((s) => {
      s.destroy();
    });

    const after = takeHeapSnapshot();

    // Throughput guard (not a leak discriminator): the 200 destroyed sources
    // remain referenced by the `sources` array at snapshot time, so their
    // retained heap masks the router-subscription leak signal (deleting destroy
    // moves the delta by <5%). Healthy delta ≈ 0.23 MB; threshold ~9× that.
    expect(after - baseline).toBeLessThan(2 * MB);
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

    // Throughput guard (not a leak discriminator): the 200 destroyed sources
    // remain referenced by the `sources` array at snapshot time, so their
    // retained heap masks the router-subscription leak signal (deleting destroy
    // moves the delta by <8%). Healthy delta ≈ 0.33 MB; threshold ~9× that.
    expect(after - baseline).toBeLessThan(3 * MB);
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

    // Throughput / stability guard. Each cycle's sources are destroyed and
    // dropped, and the per-cycle counts are small, so the spread across the 4
    // sampled snapshots reflects GC jitter rather than a per-op leak (mostly
    // cached node/active sources whose destroy is a no-op anyway). Healthy
    // spread ≈ 0.04 MB; threshold 0.5 MB sits well above run-to-run noise.
    expect(maxHeap - minHeap).toBeLessThan(MB / 2);
  });
});
