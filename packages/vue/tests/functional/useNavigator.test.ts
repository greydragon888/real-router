import { mount } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";

import { useNavigator } from "../../src/composables/useNavigator";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

function mountWithRouter(router: Router, composable: () => unknown) {
  let result: any;
  const App = defineComponent({
    setup() {
      result = composable();

      return () => h("div");
    },
  });

  mount(
    defineComponent({
      setup: () => () =>
        h(RouterProvider, { router }, { default: () => h(App) }),
    }),
  );

  return { result };
}

describe("useNavigator composable", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return navigator with full method surface", () => {
    const { result } = mountWithRouter(router, () => useNavigator());

    expect(
      Object.keys(result).toSorted((a, b) => a.localeCompare(b)),
    ).toStrictEqual([
      "canNavigateTo",
      "getState",
      "isActiveRoute",
      "isLeaveApproved",
      "navigate",
      "subscribe",
      "subscribeLeave",
    ]);
  });

  it("subscribeLeave fires on confirmed departure (LEAVE_APPROVED)", async () => {
    const { result } = mountWithRouter(router, () => useNavigator());
    const leaveCallback = vi.fn();

    const unsub = result.subscribeLeave(leaveCallback);

    await result.navigate("about");

    expect(leaveCallback).toHaveBeenCalledTimes(1);

    const [event] = leaveCallback.mock.calls[0] as [
      { route: { name: string }; nextRoute: { name: string } },
    ];

    expect(event.route.name).toBe("test");
    expect(event.nextRoute.name).toBe("about");

    unsub();
    await result.navigate("home");

    expect(leaveCallback).toHaveBeenCalledTimes(1);
  });

  it("isLeaveApproved is false outside transitions", () => {
    const { result } = mountWithRouter(router, () => useNavigator());

    expect(result.isLeaveApproved()).toBe(false);
  });

  it("should have working navigate method", async () => {
    const { result } = mountWithRouter(router, () => useNavigator());

    const state = await result.navigate("items");

    expect(state).toStrictEqual(expect.objectContaining({ name: "items" }));
  });

  it("should have working getState method", () => {
    const { result } = mountWithRouter(router, () => useNavigator());
    const state = result.getState();

    expect(state).not.toBeNull();
    expect(state!.name).toBeTypeOf("string");
  });

  it("should have working isActiveRoute method", () => {
    const { result } = mountWithRouter(router, () => useNavigator());
    const state = result.getState();

    expect(state).not.toBeNull();
    expect(result.isActiveRoute(state!.name)).toBe(true);
  });

  it("should have working subscribe method and return unsubscribe fn", async () => {
    const { result } = mountWithRouter(router, () => useNavigator());
    const callback = vi.fn();
    const unsubscribe = result.subscribe(callback);

    await result.navigate("about");

    expect(callback).toHaveBeenCalled();

    const callCount = callback.mock.calls.length;

    unsubscribe();

    await result.navigate("home");

    expect(callback).toHaveBeenCalledTimes(callCount);
  });

  it("should throw error if used outside RouterProvider", () => {
    expect(() =>
      mount(
        defineComponent({
          setup() {
            useNavigator();

            return () => h("div");
          },
        }),
      ),
    ).toThrow("useNavigator must be used within a RouterProvider");
  });
});
