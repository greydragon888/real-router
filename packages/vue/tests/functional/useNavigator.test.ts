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

  it("should return navigator with 4 methods", () => {
    const { result } = mountWithRouter(router, () => useNavigator());

    expect(result).toBeDefined();
    expect(result.navigate).toBeDefined();
    expect(result.getState).toBeDefined();
    expect(result.isActiveRoute).toBeDefined();
    expect(result.subscribe).toBeDefined();
  });

  it("should have working navigate method", async () => {
    const { result } = mountWithRouter(router, () => useNavigator());

    const state = await result.navigate("items");

    expect(state).toStrictEqual(expect.objectContaining({ name: "items" }));
  });

  it("should have working getState method", () => {
    const { result } = mountWithRouter(router, () => useNavigator());
    const state = result.getState();

    expect(state).toBeDefined();
    expect(state?.name).toBeDefined();
  });

  it("should have working isActiveRoute method", () => {
    const { result } = mountWithRouter(router, () => useNavigator());
    const state = result.getState();

    expect(result.isActiveRoute(state?.name ?? "")).toBe(true);
  });

  it("should have working subscribe method and return unsubscribe fn", () => {
    const { result } = mountWithRouter(router, () => useNavigator());
    const callback = vi.fn();
    const unsubscribe = result.subscribe(callback);

    expect(unsubscribe).toBeDefined();

    unsubscribe();
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
