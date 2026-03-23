import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { defineComponent, h } from "vue";

import { useRoute } from "../../src/composables/useRoute";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { RouteContext } from "../../src/types";
import type { Router } from "@real-router/core";

function mountWithRouter(router: Router, composable: () => RouteContext) {
  let result: RouteContext;
  const App = defineComponent({
    setup() {
      result = composable();

      return () => h("div");
    },
  });

  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(RouterProvider, { router }, { default: () => h(App) }),
    }),
  );

  return {
    get result() {
      return result!;
    },
    wrapper,
  };
}

describe("useRoute composable", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return navigator", () => {
    const { result } = mountWithRouter(router, () => useRoute());

    expect(result.navigator).toBeDefined();
    expect(result.navigator.navigate).toBeDefined();
    expect(result.navigator.getState).toBeDefined();
    expect(result.navigator.isActiveRoute).toBeDefined();
    expect(result.navigator.subscribe).toBeDefined();
  });

  it("should return current route", async () => {
    const { result } = mountWithRouter(router, () => useRoute());

    expect(result.route.value?.name).toStrictEqual("test");

    await router.navigate("items");
    await flushPromises();

    expect(result.route.value?.name).toStrictEqual("items");
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() =>
      mount(
        defineComponent({
          setup() {
            useRoute();

            return () => h("div");
          },
        }),
      ),
    ).toThrow();
  });
});
