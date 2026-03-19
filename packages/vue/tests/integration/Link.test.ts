import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { defineComponent, h } from "vue";

import { Link } from "../../src/components/Link";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

function mountWithProvider(router: Router, content: () => unknown) {
  return mount(
    defineComponent({
      setup: () => () => h(RouterProvider, { router }, { default: content }),
    }),
  );
}

describe("Link - Integration Tests", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  describe("Complex Navigation Scenarios", () => {
    it("should handle sequential navigation", async () => {
      const wrapper = mountWithProvider(router, () => [
        h(Link, { routeName: "one-more-test" }, { default: () => "Link 1" }),
        h(Link, { routeName: "users" }, { default: () => "Link 2" }),
      ]);

      const links = wrapper.findAll("a");

      await links[0].trigger("click");
      await flushPromises();

      expect(router.getState()?.name).toBe("one-more-test");

      await links[1].trigger("click");
      await flushPromises();

      expect(router.getState()?.name).toBe("users");
    });
  });

  describe("ActiveClassName Edge Cases", () => {
    it("should handle multiple classes correctly", async () => {
      await router.navigate("one-more-test");

      const wrapper = mountWithProvider(router, () =>
        h(
          Link,
          {
            routeName: "one-more-test",
            class: "class1 class2",
            activeClassName: "active1 active2",
          },
          { default: () => "Test" },
        ),
      );

      const link = wrapper.find("a");

      expect(link.classes()).toContain("class1");
      expect(link.classes()).toContain("class2");
      expect(link.classes()).toContain("active1");
      expect(link.classes()).toContain("active2");
    });

    it("should correctly toggle active class on route changes", async () => {
      const wrapper = mountWithProvider(router, () => [
        h(
          Link,
          { routeName: "one-more-test", activeClassName: "active" },
          { default: () => "Link 1" },
        ),
        h(
          Link,
          { routeName: "users", activeClassName: "active" },
          { default: () => "Link 2" },
        ),
      ]);

      const links = wrapper.findAll("a");

      await links[0].trigger("click");
      await flushPromises();

      expect(links[0].classes()).toContain("active");
      expect(links[1].classes()).not.toContain("active");

      await links[1].trigger("click");
      await flushPromises();

      expect(links[1].classes()).toContain("active");
      expect(links[0].classes()).not.toContain("active");
    });
  });

  describe("Edge Cases with Events", () => {
    it("should prevent navigation with modifier keys", async () => {
      const wrapper = mountWithProvider(router, () =>
        h(Link, { routeName: "one-more-test" }, { default: () => "Test" }),
      );

      const link = wrapper.find("a");

      await link.trigger("click", { shiftKey: true, ctrlKey: true });

      expect(router.getState()?.name).not.toBe("one-more-test");
    });
  });

  describe("Browser Plugin Integration", () => {
    it("should use buildUrl when available", () => {
      const buildUrlSpy = vi.fn(() => "/custom-url");

      router.buildUrl = buildUrlSpy;

      const wrapper = mountWithProvider(router, () =>
        h(Link, { routeName: "one-more-test" }, { default: () => "Test" }),
      );

      expect(buildUrlSpy).toHaveBeenCalledWith("one-more-test", {});
      expect(wrapper.find("a").attributes("href")).toBe("/custom-url");
    });

    it("should generate correct href with query params", () => {
      const wrapper = mountWithProvider(router, () =>
        h(
          Link,
          {
            routeName: "one-more-test",
            routeParams: { id: "123", filter: "active" },
          },
          { default: () => "Test" },
        ),
      );

      const href = wrapper.find("a").attributes("href");

      expect(href).toContain("id=123");
      expect(href).toContain("filter=active");
    });
  });

  describe("Accessibility and Semantics", () => {
    it("should preserve all passed props", () => {
      const wrapper = mountWithProvider(router, () =>
        h(
          Link,
          {
            routeName: "one-more-test",
            "aria-label": "Test link",
            role: "link",
            tabindex: 0,
          },
          { default: () => "Test" },
        ),
      );

      const link = wrapper.find("a");

      expect(link.attributes("aria-label")).toBe("Test link");
      expect(link.attributes("role")).toBe("link");
      expect(link.attributes("tabindex")).toBe("0");
    });
  });
});
