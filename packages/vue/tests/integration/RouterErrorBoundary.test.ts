import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { defineComponent, h } from "vue";

import { Link } from "../../src/components/Link";
import { RouterErrorBoundary } from "../../src/components/RouterErrorBoundary";
import { RouterProvider } from "../../src/RouterProvider";

import type { Router, RouterError } from "@real-router/core";

function mountWithProvider(router: Router, content: () => unknown) {
  return mount(
    defineComponent({
      setup: () => () => h(RouterProvider, { router }, { default: content }),
    }),
  );
}

describe("RouterErrorBoundary - Integration Tests", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/" },
      { name: "dashboard", path: "/dashboard" },
      { name: "settings", path: "/settings" },
    ]);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("Link + RouterErrorBoundary end-to-end", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const wrapper = mountWithProvider(router, () =>
      h(
        RouterErrorBoundary,
        {
          fallback: (error: RouterError) =>
            h("div", { "data-testid": "fallback" }, error.code),
        },
        {
          default: () => [
            h(
              Link,
              { routeName: "dashboard", "data-testid": "link-dashboard" },
              { default: () => "Dashboard" },
            ),
            h(
              Link,
              { routeName: "settings", "data-testid": "link-settings" },
              { default: () => "Settings" },
            ),
          ],
        },
      ),
    );

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(false);

    await wrapper.find("[data-testid='link-dashboard']").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='fallback']").text()).toBe(
      errorCodes.CANNOT_ACTIVATE,
    );

    await wrapper.find("[data-testid='link-settings']").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(false);
    expect(router.getState()?.name).toBe("settings");
  });

  it("multiple Links in one boundary trigger different errors", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);
    lifecycle.addActivateGuard("settings", () => () => false);

    const wrapper = mountWithProvider(router, () =>
      h(
        RouterErrorBoundary,
        {
          fallback: (error: RouterError) =>
            h("div", { "data-testid": "fallback" }, error.code),
        },
        {
          default: () => [
            h(
              Link,
              { routeName: "dashboard", "data-testid": "link-dashboard" },
              { default: () => "Dashboard" },
            ),
            h(
              Link,
              { routeName: "settings", "data-testid": "link-settings" },
              { default: () => "Settings" },
            ),
          ],
        },
      ),
    );

    await wrapper.find("[data-testid='link-dashboard']").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='fallback']").text()).toBe(
      errorCodes.CANNOT_ACTIVATE,
    );

    await wrapper.find("[data-testid='link-settings']").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='fallback']").text()).toBe(
      errorCodes.CANNOT_ACTIVATE,
    );
  });

  it("error without transition (SAME_STATES)", async () => {
    const wrapper = mountWithProvider(router, () =>
      h(
        RouterErrorBoundary,
        {
          fallback: (error: RouterError) =>
            h("div", { "data-testid": "fallback" }, error.code),
        },
        {
          default: () => h("div", { "data-testid": "children" }, "App"),
        },
      ),
    );

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(false);

    await router.navigate("home").catch(() => {});
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='fallback']").text()).toBe(
      errorCodes.SAME_STATES,
    );

    expect(router.getState()?.name).toBe("home");
  });
});
