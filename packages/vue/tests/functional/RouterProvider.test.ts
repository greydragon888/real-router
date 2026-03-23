import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { defineComponent, h, inject } from "vue";

import { RouterKey, RouteKey } from "../../src/context";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { RouteContext } from "../../src/types";
import type { Router } from "@real-router/core";

describe("RouterProvider component", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("should provide value from context correctly", () => {
    let capturedRouter: Router | undefined;

    const Child = defineComponent({
      setup() {
        capturedRouter = inject(RouterKey);

        return () => h("div");
      },
    });

    mount(
      defineComponent({
        setup: () => () =>
          h(RouterProvider, { router }, { default: () => h(Child) }),
      }),
    );

    expect(capturedRouter).toStrictEqual(router);
  });

  it("should render child component", () => {
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router },
            {
              default: () => h("div", { "data-testid": "child" }, "Test"),
            },
          ),
      }),
    );

    expect(wrapper.find("[data-testid='child']").text()).toBe("Test");
  });

  it("should provide initial state from context", () => {
    let routeContext: RouteContext | undefined;

    const Child = defineComponent({
      setup() {
        routeContext = inject(RouteKey);

        return () => h("div");
      },
    });

    mount(
      defineComponent({
        setup: () => () =>
          h(RouterProvider, { router }, { default: () => h(Child) }),
      }),
    );

    expect(routeContext?.route.value?.name).toStrictEqual("test");
  });

  it("should update context on router state change", async () => {
    let routeContext: RouteContext | undefined;

    const Child = defineComponent({
      setup() {
        routeContext = inject(RouteKey);

        return () => h("div");
      },
    });

    mount(
      defineComponent({
        setup: () => () =>
          h(RouterProvider, { router }, { default: () => h(Child) }),
      }),
    );

    expect(routeContext?.route.value?.name).toStrictEqual("test");

    await router.navigate("one-more-test");
    await flushPromises();

    expect(routeContext?.route.value?.name).toStrictEqual("one-more-test");
    expect(routeContext?.previousRoute.value?.name).toStrictEqual("test");
  });

  it("should call unsubscribe on unmount", () => {
    const unsubscribe = vi.fn();

    vi.spyOn(router, "subscribe").mockImplementation(() => unsubscribe);

    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(RouterProvider, { router }, { default: () => h("div") }),
      }),
    );

    expect(router.subscribe).toHaveBeenCalledTimes(1);

    wrapper.unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("should not resubscribe on rerender with same router", () => {
    vi.spyOn(router, "subscribe");

    mount(
      defineComponent({
        setup: () => () =>
          h(RouterProvider, { router }, { default: () => h("div") }),
      }),
    );

    expect(router.subscribe).toHaveBeenCalledTimes(1);
  });
});
