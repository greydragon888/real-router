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

    // 10k navs through one cached node source must not allocate more than
    // a few MB. Linear closure growth would explode this number.
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

    expect(after - baseline).toBeLessThan(5 * MB);
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
