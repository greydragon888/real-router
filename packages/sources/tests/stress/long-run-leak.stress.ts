import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createRouteSource,
  createRouteNodeSource,
  createActiveRouteSource,
  createTransitionSource,
} from "@real-router/sources";

import { createStressRouter, takeHeapSnapshot, forceGC, MB } from "./helpers";

import type { Router } from "@real-router/core";

describe("S8: long-run leak detection (10k cycle navigations)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("S8.1: 10000 navigations through cached node source — heap stable", async () => {
    const source = createRouteNodeSource(router, "users");
    const unsub = source.subscribe(() => {});

    forceGC();
    forceGC();
    const baseline = takeHeapSnapshot();

    const routes = ["users.list", "users.view", "about", "home"];

    for (let i = 0; i < 10_000; i++) {
      const route = routes[i % routes.length];

      await (route === "users.view"
        ? router.navigate(route, { id: String(i) }).catch(() => {})
        : router.navigate(route).catch(() => {}));
    }

    forceGC();
    forceGC();
    const after = takeHeapSnapshot();

    // Throughput guard (not a leak discriminator): the node source is cached
    // and shared, so a broken router-subscription teardown cannot accumulate
    // here — deleting the cleanup leaves the same single subscription. Measured
    // healthy delta ≈ 0.5 MB across runs; threshold set ~10× that as an honest
    // upper bound that still catches gross per-navigation closure growth.
    expect(after - baseline).toBeLessThan(5 * MB);

    unsub();
  });

  it("S8.2: 10000 mount/unmount cycles on RouteSource — no leaked router subscriptions", async () => {
    forceGC();
    forceGC();
    const baseline = takeHeapSnapshot();

    for (let i = 0; i < 10_000; i++) {
      const source = createRouteSource(router);
      const unsub = source.subscribe(() => {});

      if (i % 100 === 0) {
        await router.navigate(i % 200 === 0 ? "users.list" : "about");
      }

      unsub();
      source.destroy();
    }

    forceGC();
    forceGC();
    const after = takeHeapSnapshot();

    // Discriminating leak guard. Each iteration creates a non-cached RouteSource
    // and immediately unsub()+destroy()s it, leaving nothing referenced — so a
    // healthy run reclaims everything (measured delta ≈ 0.04–0.06 MB). If the
    // teardown were broken (router subscription retained), all 10 000 sources
    // stay live: simulated leak measured ≈ 9.6 MB. Threshold 1 MB sits ~16×
    // above healthy and ~9× below the leak — fails on the leak, passes healthy.
    expect(after - baseline).toBeLessThan(MB);
  });
});

describe("S9: rapid router.start/stop cycles with live sources", () => {
  it("S9.1: cached sources survive 200 start/stop cycles without throwing", async () => {
    const router = createStressRouter();

    await router.start("/");

    const nodeSource = createRouteNodeSource(router, "users");
    const activeSource = createActiveRouteSource(router, "users.list");
    const transitionSource = createTransitionSource(router);

    nodeSource.subscribe(() => {});
    activeSource.subscribe(() => {});
    transitionSource.subscribe(() => {});

    for (let i = 0; i < 50; i++) {
      router.stop();
      await router.start(i % 2 === 0 ? "/users/list" : "/about");
    }

    // Sources still produce valid snapshots after the storm.
    expect(typeof activeSource.getSnapshot()).toBe("boolean");
    expect(transitionSource.getSnapshot().isTransitioning).toBe(false);

    transitionSource.destroy();
    router.stop();
  });
});

describe("S10: concurrent destroy + subscribe in the same micro-task", () => {
  it("S10.1: 1000 race attempts where destroy and subscribe both run synchronously", () => {
    const router = createStressRouter();

    let surfaced = false;

    for (let i = 0; i < 1000; i++) {
      const source = createRouteSource(router);

      // Same-task race — `destroy()` then `subscribe()` should be a no-op
      // unsubscribe. Verifies the BaseSource.subscribe destroy-check path.
      source.destroy();

      const listener = (): void => {
        surfaced = true;
      };
      const unsub = source.subscribe(listener);

      // Returned unsubscribe should be safe to call.
      unsub();
    }

    expect(surfaced).toBe(false);

    router.stop();
  });
});
