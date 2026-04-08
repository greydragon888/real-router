import { RouteUtils } from "@real-router/route-utils";
import { mount } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { defineComponent, h } from "vue";

import { useRouteUtils } from "../../src/composables/useRouteUtils";
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

describe("useRouteUtils composable", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return a RouteUtils instance", () => {
    const { result } = mountWithRouter(router, () => useRouteUtils());

    expect(result).toBeInstanceOf(RouteUtils);
    expect(result.getChain).toBeTypeOf("function");
    expect(result.getSiblings).toBeTypeOf("function");
    expect(result.isDescendantOf).toBeTypeOf("function");
  });

  it("should have working getChain method", () => {
    const { result } = mountWithRouter(router, () => useRouteUtils());

    const chain = result.getChain("users.list");

    expect(chain).toStrictEqual(["users", "users.list"]);
  });

  it("should have working getSiblings method", () => {
    const { result } = mountWithRouter(router, () => useRouteUtils());

    const siblings = result.getSiblings("users.list");

    expect(siblings).toContain("users.view");
    expect(siblings).toContain("users.edit");
    expect(siblings).not.toContain("users.list");
  });

  it("should have working isDescendantOf method", () => {
    const { result } = mountWithRouter(router, () => useRouteUtils());

    expect(result.isDescendantOf("users.list", "users")).toBe(true);
    expect(result.isDescendantOf("users", "items")).toBe(false);
  });

  it("should return undefined for unknown routes", () => {
    const { result } = mountWithRouter(router, () => useRouteUtils());

    expect(result.getChain("nonexistent")).toBeUndefined();
    expect(result.getSiblings("nonexistent")).toBeUndefined();
  });

  it("should return different RouteUtils instances for different routers", async () => {
    const router2 = createTestRouterWithADefaultRouter();

    await router2.start();

    const { result: result1 } = mountWithRouter(router, () => useRouteUtils());
    const { result: result2 } = mountWithRouter(router2, () => useRouteUtils());

    expect(result1).toBeInstanceOf(RouteUtils);
    expect(result2).toBeInstanceOf(RouteUtils);
    expect(result1).not.toBe(result2);

    router2.stop();
  });

  it("should throw error if used outside RouterProvider", () => {
    expect(() =>
      mount(
        defineComponent({
          setup() {
            useRouteUtils();

            return () => h("div");
          },
        }),
      ),
    ).toThrow("useRouter must be used within a RouterProvider");
  });
});
