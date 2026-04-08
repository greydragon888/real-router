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

import type { Router } from "@real-router/core";

const noop = (): void => undefined;

let router: Router;

describe("L3 -- Nested Route Hooks Under Stress", () => {
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

  it("L3.1 -- 100 navigations across nested routes: only leaf hooks fire", async () => {
    const parentEnter = vi.fn();
    const parentLeave = vi.fn();
    const childEnter = vi.fn();
    const childLeave = vi.fn();

    router = createRouter(
      [
        { name: "home", path: "/" },
        {
          name: "users",
          path: "/users",
          onEnter: parentEnter,
          onLeave: parentLeave,
          children: [
            {
              name: "view",
              path: "/:id",
              onEnter: childEnter,
              onLeave: childLeave,
            },
            { name: "list", path: "/list" },
          ],
        },
      ],
      { defaultRoute: "home" },
    );
    router.usePlugin(lifecyclePluginFactory());

    await router.start("/");

    for (let i = 0; i < 100; i++) {
      await router.navigate("users.view", { id: String(i) });
      await router.navigate("home");
    }

    // Parent hooks should never fire (only leaf route hooks fire)
    expect(parentEnter).not.toHaveBeenCalled();
    expect(parentLeave).not.toHaveBeenCalled();

    // Child hooks fire 100 times each
    expect(childEnter).toHaveBeenCalledTimes(100);
    expect(childLeave).toHaveBeenCalledTimes(100);
  });

  it("L3.2 -- 100 sibling navigations under same parent: leave/enter fire for leaf only", async () => {
    const viewEnter = vi.fn();
    const viewLeave = vi.fn();
    const listEnter = vi.fn();
    const listLeave = vi.fn();

    router = createRouter(
      [
        { name: "home", path: "/" },
        {
          name: "users",
          path: "/users",
          children: [
            {
              name: "view",
              path: "/:id",
              onEnter: viewEnter,
              onLeave: viewLeave,
            },
            {
              name: "list",
              path: "/list",
              onEnter: listEnter,
              onLeave: listLeave,
            },
          ],
        },
      ],
      { defaultRoute: "home" },
    );
    router.usePlugin(lifecyclePluginFactory());

    await router.start("/");
    await router.navigate("users.view", { id: "1" });

    viewEnter.mockClear();

    for (let i = 0; i < 100; i++) {
      await router.navigate("users.list");
      await router.navigate("users.view", { id: String(i) });
    }

    // Each cycle: leave view, enter list, leave list, enter view = 2 enters + 2 leaves per route
    expect(viewEnter).toHaveBeenCalledTimes(100);
    expect(viewLeave).toHaveBeenCalledTimes(100);
    expect(listEnter).toHaveBeenCalledTimes(100);
    expect(listLeave).toHaveBeenCalledTimes(100);
  });

  it("L3.3 -- 200 same-route param changes on nested route: onStay fires, parent hooks do not", async () => {
    const parentStay = vi.fn();
    const childStay = vi.fn();

    router = createRouter(
      [
        { name: "home", path: "/" },
        {
          name: "users",
          path: "/users",
          onStay: parentStay,
          children: [{ name: "view", path: "/:id", onStay: childStay }],
        },
      ],
      { defaultRoute: "home" },
    );
    router.usePlugin(lifecyclePluginFactory());

    await router.start("/");
    await router.navigate("users.view", { id: "0" });

    for (let i = 1; i <= 200; i++) {
      await router.navigate("users.view", { id: String(i) });
    }

    expect(parentStay).not.toHaveBeenCalled();
    expect(childStay).toHaveBeenCalledTimes(200);
    expect(router.getState()?.params).toStrictEqual({ id: "200" });
  });
});
