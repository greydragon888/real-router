import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

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

describe("RouterErrorBoundary", () => {
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

  it("renders children without error", () => {
    const wrapper = mountWithProvider(router, () =>
      h(
        RouterErrorBoundary,
        {
          fallback: (error: RouterError) =>
            h("div", { "data-testid": "fallback" }, error.code),
        },
        {
          default: () => h("div", { "data-testid": "children" }, "App Content"),
        },
      ),
    );

    expect(wrapper.find("[data-testid='children']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(false);
  });

  it("shows fallback alongside children on error", async () => {
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
          default: () => h("div", { "data-testid": "children" }, "App Content"),
        },
      ),
    );

    await router.navigate("dashboard").catch(() => {});
    await flushPromises();

    expect(wrapper.find("[data-testid='children']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(true);
  });

  it("fallback receives correct RouterError", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const wrapper = mountWithProvider(router, () =>
      h(
        RouterErrorBoundary,
        {
          fallback: (error: RouterError) =>
            h("div", { "data-testid": "fallback" }, error.code),
        },
        { default: () => h("div", "App") },
      ),
    );

    await router.navigate("dashboard").catch(() => {});
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").text()).toBe(
      errorCodes.CANNOT_ACTIVATE,
    );
  });

  it("auto-resets on successful navigation", async () => {
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
          default: () => h("div", { "data-testid": "children" }, "App"),
        },
      ),
    );

    await router.navigate("dashboard").catch(() => {});
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(true);

    await router.navigate("settings");
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='children']").exists()).toBe(true);
  });

  it("resetError() hides fallback manually", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const wrapper = mountWithProvider(router, () =>
      h(
        RouterErrorBoundary,
        {
          fallback: (error: RouterError, resetError: () => void) =>
            h("div", { "data-testid": "fallback" }, [
              error.code,
              h(
                "button",
                { "data-testid": "dismiss", onClick: resetError },
                "Dismiss",
              ),
            ]),
        },
        {
          default: () => h("div", { "data-testid": "children" }, "App"),
        },
      ),
    );

    await router.navigate("dashboard").catch(() => {});
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(true);

    await wrapper.find("[data-testid='dismiss']").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='children']").exists()).toBe(true);
  });

  it("resetError() does not hide next error", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);
    lifecycle.addActivateGuard("settings", () => () => false);

    const wrapper = mountWithProvider(router, () =>
      h(
        RouterErrorBoundary,
        {
          fallback: (error: RouterError, resetError: () => void) =>
            h("div", { "data-testid": "fallback" }, [
              error.code,
              h(
                "button",
                { "data-testid": "dismiss", onClick: resetError },
                "Dismiss",
              ),
            ]),
        },
        { default: () => h("div", "App") },
      ),
    );

    await router.navigate("dashboard").catch(() => {});
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(true);

    await wrapper.find("[data-testid='dismiss']").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(false);

    await router.navigate("settings").catch(() => {});
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(true);
  });

  it("onError called on error", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const onError = vi.fn();

    mountWithProvider(router, () =>
      h(
        RouterErrorBoundary,
        {
          fallback: (error: RouterError) =>
            h("div", { "data-testid": "fallback" }, error.code),
          onError,
        },
        { default: () => h("div", "App") },
      ),
    );

    await router.navigate("dashboard").catch(() => {});
    await flushPromises();

    expect(onError).toHaveBeenCalledTimes(1);

    const [error, toRoute, fromRoute] = onError.mock.calls[0] as [
      RouterError,
      unknown,
      unknown,
    ];

    expect(error.code).toBe(errorCodes.CANNOT_ACTIVATE);
    expect(toRoute).not.toBeNull();
    expect(fromRoute).not.toBeNull();
  });

  it("onError not called on re-render", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const onError = vi.fn();
    const counter = ref(0);

    const TestWrapper = defineComponent({
      setup() {
        return () =>
          h(
            RouterErrorBoundary,
            {
              fallback: (error: RouterError) =>
                h("div", { "data-testid": "fallback" }, error.code),
              onError,
            },
            {
              default: () =>
                h(
                  "button",
                  {
                    "data-testid": "rerender",
                    onClick: () => {
                      counter.value++;
                    },
                  },
                  `Re-render ${counter.value}`,
                ),
            },
          );
      },
    });

    const wrapper = mountWithProvider(router, () => h(TestWrapper));

    await router.navigate("dashboard").catch(() => {});
    await flushPromises();

    expect(onError).toHaveBeenCalledTimes(1);

    await wrapper.find("[data-testid='rerender']").trigger("click");
    await flushPromises();

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("works with Link", async () => {
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
          default: () =>
            h(
              Link,
              { routeName: "dashboard", "data-testid": "link" },
              { default: () => "Go to Dashboard" },
            ),
        },
      ),
    );

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(false);

    await wrapper.find("[data-testid='link']").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='fallback']").text()).toBe(
      errorCodes.CANNOT_ACTIVATE,
    );
  });

  it("nested boundaries both show error", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("dashboard", () => () => false);

    const wrapper = mountWithProvider(router, () =>
      h(
        RouterErrorBoundary,
        {
          fallback: (error: RouterError) =>
            h("div", { "data-testid": "outer-fallback" }, error.code),
        },
        {
          default: () =>
            h(
              RouterErrorBoundary,
              {
                fallback: (error: RouterError) =>
                  h("div", { "data-testid": "inner-fallback" }, error.code),
              },
              {
                default: () => h("div", { "data-testid": "children" }, "App"),
              },
            ),
        },
      ),
    );

    await router.navigate("dashboard").catch(() => {});
    await flushPromises();

    expect(wrapper.find("[data-testid='outer-fallback']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='inner-fallback']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='outer-fallback']").text()).toBe(
      wrapper.find("[data-testid='inner-fallback']").text(),
    );
  });

  it("resetError then same cached error", async () => {
    const wrapper = mountWithProvider(router, () =>
      h(
        RouterErrorBoundary,
        {
          fallback: (error: RouterError, resetError: () => void) =>
            h("div", { "data-testid": "fallback" }, [
              error.code,
              h(
                "button",
                { "data-testid": "dismiss", onClick: resetError },
                "Dismiss",
              ),
            ]),
        },
        {
          default: () => h("div", { "data-testid": "children" }, "App"),
        },
      ),
    );

    await router.navigate("home").catch(() => {});
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='fallback']").text()).toContain(
      errorCodes.SAME_STATES,
    );

    await wrapper.find("[data-testid='dismiss']").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(false);

    await router.navigate("home").catch(() => {});
    await flushPromises();

    expect(wrapper.find("[data-testid='fallback']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='fallback']").text()).toContain(
      errorCodes.SAME_STATES,
    );
  });
});
