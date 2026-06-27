import { createRouter } from "@real-router/core";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

import { Link } from "../../src/components/Link";
import { EMPTY_PARAMS } from "../../src/constants";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { Component } from "vue";

// Link is exported with a strictly-typed `props` shape from defineComponent.
// Tests want to pass arbitrary prop bags (Record<string, unknown>) so they
// can sweep edge cases without per-test generic juggling. Widening once to
// `Component` here keeps the rest of the file `as any`-free.
const LinkAsComponent = Link as unknown as Component;

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
              h(LinkAsComponent, props, { default: () => slotContent }),
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

      await flushPromises();

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

    // CLAUDE.md gotcha #16: activeStrict meaning — explicit ancestor vs
    // exact comparison. Current route = "items.item" (a descendant of
    // "items"). A `<Link routeName="items">` with `activeStrict: false`
    // (default) lights up because "items" is an ancestor of "items.item".
    // The SAME Link with `activeStrict: true` does NOT light up, because
    // the current route is not exactly "items".
    //
    // Locks the documented semantic asymmetry — closes review §4 gotcha
    // #16 partial coverage finding.
    it("CLAUDE.md gotcha #16: activeStrict — ancestor route vs exact route comparison", async () => {
      // Current route = items.item (child of items).
      await router.navigate("items.item", { id: 6 });

      // activeStrict: false → ancestor "items" matches descendant "items.item".
      const ancestorWrapper = mountLink(router, {
        routeName: "items",
        activeStrict: false,
        activeClassName: "active",
      });

      expect(ancestorWrapper.find("a").classes()).toContain("active");

      // activeStrict: true → "items" must be EXACTLY the current route to
      // light up. Since the current route is "items.item" (a different,
      // longer name), the strict match fails.
      const strictAncestorWrapper = mountLink(router, {
        routeName: "items",
        activeStrict: true,
        activeClassName: "active",
      });

      expect(strictAncestorWrapper.find("a").classes()).not.toContain("active");

      // Sanity counter-case: when the Link's routeName matches the current
      // route exactly, both modes light up. activeStrict only adds a rejection
      // on top of the ancestor match, never blocks exact equality.
      const exactWrapper = mountLink(router, {
        routeName: "items.item",
        routeParams: { id: 6 },
        activeStrict: true,
        activeClassName: "active",
      });

      expect(exactWrapper.find("a").classes()).toContain("active");
    });

    // CLAUDE.md gotcha #17 — `ignoreQueryParams` Default
    //
    // The default is `ignoreQueryParams: true` (delegated through
    // `createActiveRouteSource` via `DEFAULT_ACTIVE_OPTIONS`). Practical
    // consequence: `<Link routeName="users" />` remains active even when the
    // current URL has different query params than the Link target.
    //
    // No prior direct regression at the Link layer (only `useIsActiveRoute`
    // covers the default via its own test); this locks the Link → composable
    // chain so the prop's omission yields the documented behaviour.
    it("CLAUDE.md gotcha #17: active state ignores query params by default", async () => {
      // Re-start the router with a URL that carries a query param.
      router.stop();
      await router.start("/users/list?page=2");

      // Link target = "users.list" with NO routeParams; current URL has
      // ?page=2. With the documented default (ignoreQueryParams: true), the
      // Link still lights up active.
      const wrapper = mountLink(router, {
        routeName: "users.list",
        activeClassName: "active",
      });

      await flushPromises();

      expect(wrapper.find("a").classes()).toContain("active");
    });

    it("CLAUDE.md gotcha #17 inverse: explicit ignoreQueryParams=false drops active when query differs", async () => {
      router.stop();
      await router.start("/users/list?page=2");

      // Same setup as above but the consumer opts INTO strict query matching.
      // With no `routeParams` on the Link (expected empty), query params from
      // current URL (page=2) do NOT match → inactive.
      const wrapper = mountLink(router, {
        routeName: "users.list",
        activeClassName: "active",
        ignoreQueryParams: false,
      });

      await flushPromises();

      expect(wrapper.find("a").classes()).not.toContain("active");
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

      expect(router.navigate).toHaveBeenCalledTimes(1);

      const [name, params, options] = (
        router.navigate as ReturnType<typeof vi.fn>
      ).mock.calls[0] as [string, object, object];

      expect(name).toBe("one-more-test");
      // params identity is preserved through navigateWithHash → singleton.
      expect(params).toBe(EMPTY_PARAMS);
      // navigateWithHash spreads `extraOptions` into a fresh object, so we
      // assert the structural shape rather than identity.
      expect(options).toStrictEqual({});
    });

    it("should render undefined href and log error for empty routeName", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const wrapper = mountLink(router, { routeName: "" });

      expect(wrapper.find("a").attributes("href")).toBeUndefined();
      // Lock the full canonical error message from shared/dom-utils/link-utils.ts,
      // not just a "Route """ fragment — protects against accidental rewording.
      expect(consoleError).toHaveBeenCalledWith(
        '[real-router] Route "" is not defined. The element will render without an href attribute.',
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
                    LinkAsComponent,
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
                    LinkAsComponent,
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
                    LinkAsComponent,
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
                    LinkAsComponent,
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
                    LinkAsComponent,
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

    it("should update href when routeParams CONTENT changes, and bail out on equal re-renders (shallowEqual memo)", async () => {
      const currentParams = ref<{ id: number }>({ id: 1 });

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
                      routeName: "items.item",
                      routeParams: currentParams.value,
                    },
                    { default: () => "Item" },
                  ),
              },
            ),
        }),
      );

      expect(wrapper.find("a").attributes("href")).toBe("/items/1");

      // Content change → the content-stable params memo updates, href follows.
      currentParams.value = { id: 2 };
      await flushPromises();

      expect(wrapper.find("a").attributes("href")).toBe("/items/2");

      // Fresh object literal with identical content → shallowEqual bail-out:
      // the params reference stays stable, so href does not recompute or change.
      currentParams.value = { id: 2 };
      await flushPromises();

      expect(wrapper.find("a").attributes("href")).toBe("/items/2");
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

      expect(router.navigate).toHaveBeenCalledTimes(1);

      const [name, params, options] = (
        router.navigate as ReturnType<typeof vi.fn>
      ).mock.calls[0] as [string, object, object];

      expect(name).toBe("one-more-test");
      expect(params).toBe(EMPTY_PARAMS);
      expect(options).toStrictEqual({});
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
      '[real-router] Route "@@nonexistent-route" is not defined. The element will render without an href attribute.',
    );

    consoleError.mockRestore();
  });
});
