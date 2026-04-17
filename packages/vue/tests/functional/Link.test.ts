import { createRouter } from "@real-router/core";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

import { Link } from "../../src/components/Link";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

function mountLink(
  router: Router,
  props: Record<string, unknown>,
  slotContent = "Test",
) {
  return mount(
    defineComponent({
      setup: () => () =>
        h(
          RouterProvider,
          { router },
          {
            default: () =>
              h(Link as any, props, { default: () => slotContent }),
          },
        ),
    }),
  );
}

describe("Link component", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("should render component, href and children correctly", () => {
    const wrapper = mountLink(router, { routeName: "one-more-test" });

    const link = wrapper.find("a");

    expect(link.exists()).toBe(true);
    expect(link.text()).toBe("Test");
    expect(link.attributes("href")).toBe("/test");
  });

  it("should render component with passed class name", () => {
    const wrapper = mountLink(router, {
      routeName: "one-more-test",
      class: "test-class",
    });

    const link = wrapper.find("a");

    expect(link.classes()).toContain("test-class");
  });

  describe("activeClassName", () => {
    it("should set active class when route matches", async () => {
      const wrapper = mountLink(router, {
        routeName: "one-more-test",
        activeClassName: "active",
      });

      const link = wrapper.find("a");

      expect(link.classes()).not.toContain("active");

      await link.trigger("click");
      await flushPromises();

      expect(link.classes()).toContain("active");
    });

    it("should add active class based on activeStrict", async () => {
      await router.navigate("items.item", { id: 6 });

      const wrapper = mountLink(router, {
        routeName: "items",
        activeStrict: false,
        activeClassName: "active",
      });

      expect(wrapper.find("a").classes()).toContain("active");
    });
  });

  describe("clickHandler", () => {
    it("should prevent navigation on non-left click", async () => {
      vi.spyOn(router, "navigate");

      const wrapper = mountLink(router, { routeName: "one-more-test" });

      await wrapper.find("a").trigger("click", { button: 1 });

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should navigate on synthetic touch-derived click (button=0, no modifiers)", async () => {
      // Touch events synthesize click with button=0 and no modifier keys —
      // shouldNavigate must accept them. Documents that touch flow works.
      vi.spyOn(router, "navigate");

      const wrapper = mountLink(router, { routeName: "one-more-test" });

      await wrapper.find("a").trigger("click", {
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
      });

      expect(router.navigate).toHaveBeenCalledWith(
        "one-more-test",
        expect.any(Object),
        expect.any(Object),
      );
    });

    it("should render undefined href and log error for empty routeName", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const wrapper = mountLink(router, { routeName: "" });

      expect(wrapper.find("a").attributes("href")).toBeUndefined();
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining(`Route ""`),
      );

      consoleError.mockRestore();
    });

    it("should not navigate when target is _blank", async () => {
      vi.spyOn(router, "navigate");

      const wrapper = mountLink(router, {
        routeName: "one-more-test",
        target: "_blank",
      });

      await wrapper.find("a").trigger("click");

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should invoke ALL handlers when attrs.onClick is an array (Vue template multi-handler)", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      vi.spyOn(router, "navigate");

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router },
              {
                default: () =>
                  h(
                    Link as any,
                    {
                      routeName: "one-more-test",
                      // Vue's compiled template emits this shape for multiple
                      // @click handlers. Previously, Link silently dropped it
                      // (typeof !== 'function' check) — bug from review.
                      onClick: [handler1, handler2],
                    },
                    { default: () => "Test" },
                  ),
              },
            ),
        }),
      );

      await wrapper.find("a").trigger("click");

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      // Navigation still happens because none of the handlers preventDefault.
      expect(router.navigate).toHaveBeenCalled();
    });

    it("should stop array handlers and skip navigation if one preventDefaults", async () => {
      const handler1 = vi.fn((evt: Event) => {
        evt.preventDefault();
      });
      const handler2 = vi.fn();

      vi.spyOn(router, "navigate");

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router },
              {
                default: () =>
                  h(
                    Link as any,
                    {
                      routeName: "one-more-test",
                      onClick: [handler1, handler2],
                    },
                    { default: () => "Test" },
                  ),
              },
            ),
        }),
      );

      await wrapper.find("a").trigger("click");

      expect(handler1).toHaveBeenCalledTimes(1);
      // Second handler is skipped after defaultPrevented (matches single-handler behavior).
      expect(handler2).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should ignore non-function entries inside onClick array gracefully", async () => {
      const handler = vi.fn();

      vi.spyOn(router, "navigate");

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router },
              {
                default: () =>
                  h(
                    Link as any,
                    {
                      routeName: "one-more-test",
                      onClick: [null, handler, undefined],
                    },
                    { default: () => "Test" },
                  ),
              },
            ),
        }),
      );

      await wrapper.find("a").trigger("click");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(router.navigate).toHaveBeenCalled();
    });

    it("should call onClick callback from attrs", async () => {
      const onClickMock = vi.fn();

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router },
              {
                default: () =>
                  h(
                    Link as any,
                    { routeName: "one-more-test", onClick: onClickMock },
                    { default: () => "Test" },
                  ),
              },
            ),
        }),
      );

      await wrapper.find("a").trigger("click");

      expect(onClickMock).toHaveBeenCalled();
    });

    it("should not navigate when onClick prevents default", async () => {
      vi.spyOn(router, "navigate");

      const onClickMock = vi.fn((event: Event) => {
        event.preventDefault();
      });

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router },
              {
                default: () =>
                  h(
                    Link as any,
                    { routeName: "one-more-test", onClick: onClickMock },
                    { default: () => "Test" },
                  ),
              },
            ),
        }),
      );

      await wrapper.find("a").trigger("click");

      expect(onClickMock).toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe("URL Building", () => {
    it("should use buildPath when router has no buildUrl", async () => {
      const routerWithoutBuildUrl = createRouter([
        { name: "test", path: "/" },
        { name: "users", path: "/users" },
      ]);

      await routerWithoutBuildUrl.start("/");

      const wrapper = mountLink(routerWithoutBuildUrl, {
        routeName: "users",
      });

      expect(wrapper.find("a").attributes("href")).toBe("/users");

      routerWithoutBuildUrl.stop();
    });
  });

  describe("Props and Updates", () => {
    it("should update active state when routeName prop changes", async () => {
      await router.navigate("one-more-test");
      await flushPromises();

      const currentRouteName = ref("one-more-test");

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router },
              {
                default: () =>
                  h(
                    Link,
                    {
                      routeName: currentRouteName.value,
                      activeClassName: "active",
                    },
                    { default: () => "Link" },
                  ),
              },
            ),
        }),
      );

      expect(wrapper.find("a").classes()).toContain("active");

      currentRouteName.value = "items";
      await flushPromises();

      expect(wrapper.find("a").classes()).not.toContain("active");

      await router.navigate("items");
      await flushPromises();

      expect(wrapper.find("a").classes()).toContain("active");
    });
  });

  describe("Default prop factories", () => {
    it("should use default routeParams factory when prop is not provided", () => {
      const wrapper = mountLink(router, {
        routeName: "one-more-test",
      });

      const link = wrapper.find("a");

      expect(link.exists()).toBe(true);
      expect(link.attributes("href")).toBe("/test");
    });

    it("should use default routeOptions factory when prop is not provided", async () => {
      vi.spyOn(router, "navigate");

      const wrapper = mountLink(router, {
        routeName: "one-more-test",
      });

      await wrapper.find("a").trigger("click");
      await flushPromises();

      expect(router.navigate).toHaveBeenCalledWith(
        "one-more-test",
        expect.any(Object),
        expect.any(Object),
      );
    });

    it("should render correctly without routeParams and routeOptions props", () => {
      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router },
              {
                default: () =>
                  h(
                    Link,
                    { routeName: "one-more-test" },
                    {
                      default: () => "Link Text",
                    },
                  ),
              },
            ),
        }),
      );

      const link = wrapper.find("a");

      expect(link.exists()).toBe(true);
      expect(link.text()).toBe("Link Text");
      expect(link.attributes("href")).toBe("/test");
    });
  });

  it("should render without href and log error for invalid routeName", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const wrapper = mountLink(router, { routeName: "@@nonexistent-route" });

    const link = wrapper.find("a");

    expect(link.exists()).toBe(true);
    expect(link.attributes("href")).toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("@@nonexistent-route"),
    );

    consoleError.mockRestore();
  });
});
