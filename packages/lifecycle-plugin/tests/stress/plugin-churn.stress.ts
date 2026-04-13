import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { lifecyclePluginFactory } from "../../src";

import type { LifecycleHook } from "../../src";
import type { Router } from "@real-router/core";

const noop = (): void => undefined;

describe("Lifecycle Plugin Churn", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("100 usePlugin/unsubscribe cycles: hooks fire only while plugin active", async () => {
    const enterCalls: number[] = [];
    const onEnter: LifecycleHook = () => {
      enterCalls.push(1);
    };

    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "about", path: "/about", onEnter: () => onEnter },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/");

    for (let i = 0; i < 100; i++) {
      const unsub = router.usePlugin(lifecyclePluginFactory());

      await router.navigate("about");
      unsub();
      await router.navigate("home");
    }

    // onEnter should fire exactly 100 times (once per active plugin cycle)
    expect(enterCalls).toHaveLength(100);

    router.stop();
  });

  it("50 full router create+plugin+navigate+dispose cycles: no crashes", async () => {
    let completed = 0;

    for (let i = 0; i < 50; i++) {
      const onEnter = vi.fn();
      const onLeave = vi.fn();

      const router = createRouter(
        [
          { name: "home", path: "/", onLeave: () => onLeave },
          { name: "about", path: "/about", onEnter: () => onEnter },
        ],
        { defaultRoute: "home" },
      );

      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("about");

      expect(onEnter).toHaveBeenCalledTimes(1);
      expect(onLeave).toHaveBeenCalledTimes(1);

      router.stop();
      router.dispose();
      completed++;
    }

    expect(completed).toBe(50);
  });

  it("multiple plugins on same router: hooks fire once per plugin instance", async () => {
    const enterCallsA: number[] = [];
    const enterCallsB: number[] = [];

    const onEnterA: LifecycleHook = () => {
      enterCallsA.push(1);
    };
    const onEnterB: LifecycleHook = () => {
      enterCallsB.push(1);
    };

    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "about", path: "/about", onEnter: () => onEnterA },
      ],
      { defaultRoute: "home" },
    );

    const unsub1 = router.usePlugin(lifecyclePluginFactory());
    const unsub2 = router.usePlugin(lifecyclePluginFactory());

    await router.start("/");

    for (let i = 0; i < 50; i++) {
      await router.navigate("about");
      await router.navigate("home");
    }

    // Each plugin instance fires onEnter independently
    // onEnterA fires twice per round-trip (once per plugin instance) * 50 trips
    // BUT both plugins share the same route config with the same onEnter callback,
    // so onEnterA fires 2 * 50 = 100 times total
    expect(enterCallsA).toHaveLength(100);

    unsub1();

    // Now detach plugin B and use a route with a different callback
    const routerB = createRouter(
      [
        { name: "home", path: "/" },
        { name: "about", path: "/about", onEnter: () => onEnterB },
      ],
      { defaultRoute: "home" },
    );

    routerB.usePlugin(lifecyclePluginFactory());
    await routerB.start("/");

    for (let i = 0; i < 25; i++) {
      await routerB.navigate("about");
      await routerB.navigate("home");
    }

    expect(enterCallsB).toHaveLength(25);

    unsub2();
    router.stop();
    routerB.stop();
  });

  it("100 start/stop cycles with lifecycle hooks: hooks only fire while active", async () => {
    let enterCount = 0;
    const onEnter: LifecycleHook = () => {
      enterCount++;
    };

    const router: Router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "about", path: "/about", onEnter: () => onEnter },
      ],
      { defaultRoute: "home" },
    );

    router.usePlugin(lifecyclePluginFactory());

    for (let i = 0; i < 100; i++) {
      await router.start("/");
      await router.navigate("about");
      router.stop();
    }

    // 100 navigations to "about" trigger onEnter for "about"
    // start("/") goes to "home" which has no onEnter hook
    expect(enterCount).toBe(100);

    router.dispose();
  });

  it("single factory result used across 50 router instances", async () => {
    const pluginFactory = lifecyclePluginFactory();
    let totalEnterCalls = 0;

    for (let i = 0; i < 50; i++) {
      const onEnter: LifecycleHook = () => {
        totalEnterCalls++;
      };

      const r = createRouter(
        [
          { name: "home", path: "/" },
          { name: "about", path: "/about", onEnter: () => onEnter },
        ],
        { defaultRoute: "home" },
      );

      r.usePlugin(pluginFactory);

      await r.start("/");
      await r.navigate("about");

      r.stop();
      r.dispose();
    }

    expect(totalEnterCalls).toBe(50);
  });
});
