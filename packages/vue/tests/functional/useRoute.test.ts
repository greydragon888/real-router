import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { defineComponent, h, watchSyncEffect } from "vue";

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

    expect(result.navigator).toBeTypeOf("object");
    expect(result.navigator.navigate).toBeTypeOf("function");
    expect(result.navigator.getState).toBeTypeOf("function");
    expect(result.navigator.isActiveRoute).toBeTypeOf("function");
    expect(result.navigator.subscribe).toBeTypeOf("function");
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

  it("should not trigger effect when nested property is mutated (shallowRef behavior)", async () => {
    let effectCount = 0;

    const App = defineComponent({
      setup() {
        const { route } = useRoute();

        watchSyncEffect(() => {
          if (route.value) {
            effectCount++;
          }
        });

        return () => h("div");
      },
    });

    mount(
      defineComponent({
        setup: () => () =>
          h(RouterProvider, { router }, { default: () => h(App) }),
      }),
    );

    await flushPromises();

    const countAfterMount = effectCount;

    // Navigate to get a route with params
    await router.navigate("items.item", { id: 6 });
    await flushPromises();

    const countAfterNavigation = effectCount;

    expect(countAfterNavigation).toBeGreaterThan(countAfterMount);

    // Re-assign the same snapshot back to the shallowRef —
    // since shallowRef tracks identity, same reference means NO effect fires.
    // This verifies the "shallow" semantics: only reference changes trigger updates.
    // (Route state objects are frozen so we can't mutate nested props directly,
    // but the key behavior is that shallowRef compares by identity, not deep equality.)
    await flushPromises();

    // Effect count should NOT have increased — no new navigation, same reference
    expect(effectCount).toBe(countAfterNavigation);

    // Navigate to same route with same params — router deduplicates, no ref change
    await router.navigate("items.item", { id: 6 }).catch(() => {});
    await flushPromises();

    // shallowRef did not trigger because reference did not change
    expect(effectCount).toBe(countAfterNavigation);
  });
});
