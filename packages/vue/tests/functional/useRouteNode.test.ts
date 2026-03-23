import { getRoutesApi } from "@real-router/core/api";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { defineComponent, h } from "vue";

import { useRouteNode } from "../../src/composables/useRouteNode";
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

describe("useRouteNode", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return the router context", () => {
    const { result } = mountWithRouter(router, () => useRouteNode(""));

    expect(result.navigator).toBeDefined();
    expect(result.route.value).toStrictEqual(undefined);
    expect(result.previousRoute.value).toStrictEqual(undefined);
  });

  it("should not return a null route with a default route and the router started", async () => {
    const { result } = mountWithRouter(router, () => useRouteNode(""));

    await router.start();
    await flushPromises();

    expect(result.route.value?.name).toStrictEqual("test");
  });

  it("should change route if composable was subscribed to root node", async () => {
    const { result } = mountWithRouter(router, () => useRouteNode(""));

    await router.start();
    await flushPromises();

    expect(result.route.value?.name).toStrictEqual("test");

    await router.navigate("one-more-test");
    await flushPromises();

    expect(result.route.value?.name).toStrictEqual("one-more-test");
  });

  it("should change route if composable was subscribed to changed node", async () => {
    const { result } = mountWithRouter(router, () => useRouteNode("items"));

    await router.start();
    await flushPromises();

    expect(result.route.value?.name).toStrictEqual(undefined);

    await router.navigate("items");
    await flushPromises();

    expect(result.route.value?.name).toStrictEqual("items");

    await router.navigate("items.item", { id: 6 });
    await flushPromises();

    expect(result.route.value?.name).toStrictEqual("items.item");
    expect(result.route.value?.params).toStrictEqual({ id: 6 });

    await router.navigate("items");
    await flushPromises();

    expect(result.route.value?.name).toStrictEqual("items");
    expect(result.route.value?.params).toStrictEqual({});
  });

  it("should update only when node is affected", async () => {
    const { result } = mountWithRouter(router, () => useRouteNode("users"));

    await router.start();
    await flushPromises();

    expect(result.route.value).toBeUndefined();

    await router.navigate("home");
    await flushPromises();

    expect(result.route.value).toBeUndefined();

    await router.navigate("users.list");
    await flushPromises();

    expect(result.route.value?.name).toBe("users.list");

    await router.navigate("users.view", { id: "123" });
    await flushPromises();

    expect(result.route.value?.name).toBe("users.view");

    await router.navigate("home");
    await flushPromises();

    expect(result.route.value).toBeUndefined();
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() =>
      mount(
        defineComponent({
          setup() {
            useRouteNode("");

            return () => h("div");
          },
        }),
      ),
    ).toThrow();
  });

  it("should handle node becoming inactive and active again", async () => {
    const { result } = mountWithRouter(router, () => useRouteNode("users"));

    await router.start();
    await router.navigate("users.view", { id: "123" });
    await flushPromises();

    expect(result.route.value?.name).toBe("users.view");

    await router.navigate("home");
    await flushPromises();

    expect(result.route.value).toBeUndefined();
    expect(result.previousRoute.value?.name).toBe("users.view");

    await router.navigate("users.list");
    await flushPromises();

    expect(result.route.value?.name).toBe("users.list");
    expect(result.previousRoute.value?.name).toBe("home");
  });

  it("should handle deeply nested node correctly", async () => {
    getRoutesApi(router).add([
      {
        name: "admin",
        path: "/admin",
        children: [
          {
            name: "settings",
            path: "/settings",
            children: [{ name: "security", path: "/security" }],
          },
        ],
      },
    ]);

    const { result } = mountWithRouter(router, () =>
      useRouteNode("admin.settings"),
    );

    await router.start();
    await router.navigate("admin");
    await flushPromises();

    expect(result.route.value).toBeUndefined();

    await router.navigate("admin.settings");
    await flushPromises();

    expect(result.route.value?.name).toBe("admin.settings");

    await router.navigate("admin.settings.security");
    await flushPromises();

    expect(result.route.value?.name).toBe("admin.settings.security");
  });
});
