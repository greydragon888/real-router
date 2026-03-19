import { getRoutesApi } from "@real-router/core/api";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { defineComponent, h } from "vue";

import { useIsActiveRoute } from "../../src/composables/useIsActiveRoute";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ShallowRef } from "vue";

function mountWithRouter(
  router: Router,
  composable: () => ShallowRef<boolean>,
) {
  let result: ShallowRef<boolean>;
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

describe("useIsActiveRoute", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/users/123");
  });

  afterEach(() => {
    router.stop();
  });

  it("should check if route is active", () => {
    const { result } = mountWithRouter(router, () =>
      useIsActiveRoute("users.view", { id: "123" }),
    );

    expect(result.value).toBe(true);
  });

  it("should handle non-strict mode", () => {
    const { result } = mountWithRouter(router, () =>
      useIsActiveRoute("users", {}, false),
    );

    expect(result.value).toBe(true);
  });

  it("should handle strict mode", () => {
    const { result } = mountWithRouter(router, () =>
      useIsActiveRoute("users", {}, true),
    );

    expect(result.value).toBe(false);
  });

  it("should update when route changes", async () => {
    const { result } = mountWithRouter(router, () =>
      useIsActiveRoute("users.view", { id: "123" }),
    );

    expect(result.value).toBe(true);

    await router.navigate("home");
    await flushPromises();

    expect(result.value).toBe(false);
  });

  it("should handle empty and undefined parameters", async () => {
    router.stop();
    await router.start("/users/list");

    const { result: emptyParams } = mountWithRouter(router, () =>
      useIsActiveRoute("users.list", {}),
    );

    expect(emptyParams.value).toBe(true);
  });

  it("should correctly check parent route with nested active route", async () => {
    getRoutesApi(router).add([
      {
        name: "settings",
        path: "/settings",
        children: [
          {
            name: "profile",
            path: "/profile",
            children: [{ name: "edit", path: "/edit" }],
          },
        ],
      },
    ]);

    await router.navigate("settings.profile.edit");
    await flushPromises();

    const { result: nonStrict } = mountWithRouter(router, () =>
      useIsActiveRoute("settings", {}, false),
    );

    expect(nonStrict.value).toBe(true);

    const { result: strict } = mountWithRouter(router, () =>
      useIsActiveRoute("settings", {}, true),
    );

    expect(strict.value).toBe(false);
  });
});
