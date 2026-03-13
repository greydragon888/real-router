import { describe, it, expect } from "vitest";

import { createRouter, events, getPluginApi } from "@real-router/core";

import {
  createStressRouter,
  formatBytes,
  MB,
  takeHeapSnapshot,
} from "./helpers";

describe("S7: EventEmitter recursion and depth", () => {
  it("S7.1: maxEventDepth:3 — recursive navigateToNotFound hits depth limit, router recovers", async () => {
    const maxEventDepth = 3;
    const router = createRouter(
      [
        { name: "route0", path: "/route0" },
        { name: "route1", path: "/route1" },
        { name: "route2", path: "/route2" },
      ],
      { defaultRoute: "route0", limits: { maxEventDepth } },
    );

    await router.start("/route0");

    let recursionCount = 0;

    const unsub = getPluginApi(router).addEventListener(
      events.TRANSITION_SUCCESS,
      () => {
        recursionCount++;
        router.navigateToNotFound("/notfound");
      },
    );

    await router.navigate("route1").catch(() => {});

    unsub();

    expect(recursionCount).toBe(maxEventDepth);
    expect(router.isActive()).toBe(true);

    const state = await router.navigate("route2");

    expect(state.name).toBe("route2");

    router.stop();
    router.dispose();
  });

  it("S7.2: Cross-event: TRANSITION_SUCCESS listener triggers another navigation", async () => {
    const router = createStressRouter(10, { limits: { maxEventDepth: 5 } });

    await router.start("/route0");

    let triggered = false;

    const unsub = getPluginApi(router).addEventListener(
      events.TRANSITION_SUCCESS,
      () => {
        if (!triggered) {
          triggered = true;
          router.navigate("route2").catch(() => {});
        }
      },
    );

    await router.navigate("route1");

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(triggered).toBe(true);
    expect(router.getState()?.name).toBe("route2");

    unsub();
    router.stop();
    router.dispose();
  });

  it("S7.3: Recovery after depth error — depth map resets, next navigate works", async () => {
    const router = createRouter(
      [
        { name: "route0", path: "/route0" },
        { name: "route1", path: "/route1" },
        { name: "route2", path: "/route2" },
      ],
      { defaultRoute: "route0", limits: { maxEventDepth: 1 } },
    );

    await router.start("/route0");

    const unsub = getPluginApi(router).addEventListener(
      events.TRANSITION_SUCCESS,
      () => {
        router.navigateToNotFound("/notfound");
      },
    );

    await router.navigate("route1").catch(() => {});

    unsub();

    expect(router.isActive()).toBe(true);

    const state = await router.navigate("route2");

    expect(state.name).toBe("route2");

    router.stop();
    router.dispose();
  });

  it("S7.4: 1000 navigations with depth tracking — heap stable", async () => {
    const router = createStressRouter(10, { limits: { maxEventDepth: 5 } });

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 1000; i++) {
      await router.navigate(`route${(i % 9) + 1}`);
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(10 * MB);

    router.stop();
    router.dispose();
  });

  it("S7.5: Listener throwing on TRANSITION_SUCCESS — 1000 navigations keep working", async () => {
    const router = createStressRouter(10, { limits: { maxEventDepth: 0 } });

    await router.start("/route0");

    let throwCount = 0;

    const unsub = getPluginApi(router).addEventListener(
      events.TRANSITION_SUCCESS,
      () => {
        throwCount++;

        throw new Error("intentional listener error");
      },
    );

    for (let i = 0; i < 1000; i++) {
      await router.navigate(`route${(i % 9) + 1}`);
    }

    expect(throwCount).toBe(1000);
    expect(router.isActive()).toBe(true);

    unsub();
    router.stop();
    router.dispose();
  });
});
