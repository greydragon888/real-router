import { createRouter } from "@real-router/core";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";

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

    it("should not navigate when target is _blank", async () => {
      vi.spyOn(router, "navigate");

      const wrapper = mountLink(router, {
        routeName: "one-more-test",
        target: "_blank",
      });

      await wrapper.find("a").trigger("click");

      expect(router.navigate).not.toHaveBeenCalled();
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
    it("should update children when props change", () => {
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
                      default: () => "Original Text",
                    },
                  ),
              },
            ),
        }),
      );

      expect(wrapper.find("a").text()).toBe("Original Text");
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
