import { createRouter } from "@real-router/core";
import {
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { lifecyclePluginFactory } from "../../src";

import type { LifecycleHook, LifecycleHookFactory } from "../../src";
import type { Router } from "@real-router/core";

const noop = (): void => undefined;

let router: Router;

describe("Rapid Lifecycle Hook Invocation", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterEach(() => {
    router.stop();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("200 navigations: onEnter fires for each route change", async () => {
    const enterCalls: string[] = [];
    const onEnterHome: LifecycleHook = (toState) => {
      enterCalls.push(toState.name);
    };
    const onEnterAbout: LifecycleHook = (toState) => {
      enterCalls.push(toState.name);
    };

    router = createRouter(
      [
        { name: "home", path: "/", onEnter: () => onEnterHome },
        { name: "about", path: "/about", onEnter: () => onEnterAbout },
      ],
      { defaultRoute: "home" },
    );
    router.usePlugin(lifecyclePluginFactory());

    await router.start("/");

    for (let i = 0; i < 200; i++) {
      const target = i % 2 === 0 ? "about" : "home";

      await router.navigate(target);
    }

    // 1 for initial start + 200 navigations
    expect(enterCalls).toHaveLength(201);
    expect(router.getState()?.name).toBe("home");
  });

  it("200 navigations: onLeave fires for each route departure", async () => {
    const leaveCalls: string[] = [];
    const onLeaveHome: LifecycleHook = (_toState, fromState) => {
      leaveCalls.push(fromState!.name);
    };
    const onLeaveAbout: LifecycleHook = (_toState, fromState) => {
      leaveCalls.push(fromState!.name);
    };

    router = createRouter(
      [
        { name: "home", path: "/", onLeave: () => onLeaveHome },
        { name: "about", path: "/about", onLeave: () => onLeaveAbout },
      ],
      { defaultRoute: "home" },
    );
    router.usePlugin(lifecyclePluginFactory());

    await router.start("/");

    for (let i = 0; i < 200; i++) {
      const target = i % 2 === 0 ? "about" : "home";

      await router.navigate(target);
    }

    // onLeave fires for each of the 200 navigations (not on initial start)
    expect(leaveCalls).toHaveLength(200);
  });

  it("200 same-route navigations with param changes: onStay fires each time", async () => {
    const stayCalls: string[] = [];
    const onStay: LifecycleHook = (toState) => {
      stayCalls.push(toState.params.id as string);
    };

    router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "users.view", path: "/users/:id", onStay: () => onStay },
      ],
      { defaultRoute: "home" },
    );
    router.usePlugin(lifecyclePluginFactory());

    await router.start("/");
    await router.navigate("users.view", { id: "0" });

    for (let i = 1; i <= 200; i++) {
      await router.navigate("users.view", { id: String(i) });
    }

    expect(stayCalls).toHaveLength(200);
    expect(stayCalls.at(-1)).toBe("200");
    expect(router.getState()?.params).toStrictEqual({ id: "200" });
  });

  it("100 navigations: onLeave fires before onEnter in every pair", async () => {
    const callOrder: string[] = [];
    const onLeaveHome: LifecycleHook = () => {
      callOrder.push("leave:home");
    };
    const onLeaveAbout: LifecycleHook = () => {
      callOrder.push("leave:about");
    };
    const onEnterHome: LifecycleHook = () => {
      callOrder.push("enter:home");
    };
    const onEnterAbout: LifecycleHook = () => {
      callOrder.push("enter:about");
    };

    router = createRouter(
      [
        {
          name: "home",
          path: "/",
          onLeave: () => onLeaveHome,
          onEnter: () => onEnterHome,
        },
        {
          name: "about",
          path: "/about",
          onLeave: () => onLeaveAbout,
          onEnter: () => onEnterAbout,
        },
      ],
      { defaultRoute: "home" },
    );
    router.usePlugin(lifecyclePluginFactory());

    await router.start("/");
    callOrder.length = 0;

    for (let i = 0; i < 100; i++) {
      const target = i % 2 === 0 ? "about" : "home";

      await router.navigate(target);
    }

    // Each navigation produces exactly 1 leave + 1 enter = 200 calls
    expect(callOrder).toHaveLength(200);

    // Verify ordering: every leave comes before its paired enter
    for (let i = 0; i < callOrder.length; i += 2) {
      expect(callOrder[i]).toMatch(/^leave:/);
      expect(callOrder[i + 1]).toMatch(/^enter:/);
    }
  });

  it("100 navigations with throwing hooks: errors logged, transitions complete", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(noop);

    let enterCount = 0;
    const throwingEnter: LifecycleHook = () => {
      enterCount++;

      throw new Error(`hook error ${enterCount}`);
    };

    router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "about", path: "/about", onEnter: () => throwingEnter },
      ],
      { defaultRoute: "home" },
    );
    router.usePlugin(lifecyclePluginFactory());

    await router.start("/");

    for (let i = 0; i < 100; i++) {
      await router.navigate("about");
      await router.navigate("home");
    }

    expect(enterCount).toBe(100);
    expect(errorSpy).toHaveBeenCalled();
    expect(router.getState()?.name).toBe("home");
  });

  it("100 navigations with throwing hook factory: factory retried each time", async () => {
    let factoryCallCount = 0;
    const throwingFactory: LifecycleHookFactory = () => {
      factoryCallCount++;

      throw new Error(`factory error ${factoryCallCount}`);
    };

    router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "about", path: "/about", onEnter: throwingFactory },
      ],
      { defaultRoute: "home" },
    );
    router.usePlugin(lifecyclePluginFactory());

    await router.start("/");

    for (let i = 0; i < 100; i++) {
      await router.navigate("about");
      await router.navigate("home");
    }

    // Factory throws → hook not cached → factory retried each navigation to "about"
    expect(factoryCallCount).toBe(100);
    expect(router.getState()?.name).toBe("home");
  });
});
