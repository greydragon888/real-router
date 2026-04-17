import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { Fragment, defineComponent, h } from "vue";

import { RouteView } from "../../src/components/RouteView";
import { Match, NotFound } from "../../src/components/RouteView/components";
import { collectElements } from "../../src/components/RouteView/helpers";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

function mountRouteView(router: Router, routeViewVNode: unknown) {
  return mount(
    defineComponent({
      setup: () => () =>
        h(RouterProvider, { router }, { default: () => routeViewVNode }),
    }),
  );
}

describe("RouteView", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("Segment matching", () => {
    it("should render matched Match", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () =>
              h(
                RouteView.Match,
                { segment: "users" },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
          },
        ),
      );

      expect(wrapper.find("[data-testid='users']").exists()).toBe(true);
    });

    it("should return null if no match", async () => {
      await router.start("/about");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () =>
              h(
                RouteView.Match,
                { segment: "users" },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
          },
        ),
      );

      expect(wrapper.find("[data-testid='users']").exists()).toBe(false);
    });

    it("should support exact matching — matches exact route only", async () => {
      await router.start("/users");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () =>
              h(
                RouteView.Match,
                { segment: "users", exact: true },
                {
                  default: () =>
                    h("div", { "data-testid": "users-exact" }, "Users Exact"),
                },
              ),
          },
        ),
      );

      expect(wrapper.find("[data-testid='users-exact']").exists()).toBe(true);
    });

    it("should support exact matching — does not match descendants", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () =>
              h(
                RouteView.Match,
                { segment: "users", exact: true },
                {
                  default: () =>
                    h("div", { "data-testid": "users-exact" }, "Users Exact"),
                },
              ),
          },
        ),
      );

      expect(wrapper.find("[data-testid='users-exact']").exists()).toBe(false);
    });

    it("should support startsWith matching by default", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () =>
              h(
                RouteView.Match,
                { segment: "users" },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
          },
        ),
      );

      expect(wrapper.find("[data-testid='users']").exists()).toBe(true);
    });

    it("should render first Match on multiple matches", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () => [
              h(
                RouteView.Match,
                { segment: "users" },
                {
                  default: () => h("div", { "data-testid": "first" }, "First"),
                },
              ),
              h(
                RouteView.Match,
                { segment: "users" },
                {
                  default: () =>
                    h("div", { "data-testid": "second" }, "Second"),
                },
              ),
            ],
          },
        ),
      );

      expect(wrapper.find("[data-testid='first']").exists()).toBe(true);
      expect(wrapper.find("[data-testid='second']").exists()).toBe(false);
    });

    it("should correctly build fullSegmentName for nested RouteView", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "users" },
          {
            default: () => [
              h(
                RouteView.Match,
                { segment: "list" },
                {
                  default: () =>
                    h("div", { "data-testid": "users-list" }, "List"),
                },
              ),
              h(
                RouteView.Match,
                { segment: "view" },
                {
                  default: () =>
                    h("div", { "data-testid": "users-view" }, "View"),
                },
              ),
            ],
          },
        ),
      );

      expect(wrapper.find("[data-testid='users-list']").exists()).toBe(true);
      expect(wrapper.find("[data-testid='users-view']").exists()).toBe(false);

      await router.navigate("users.view", { id: "1" });
      await flushPromises();

      expect(wrapper.find("[data-testid='users-list']").exists()).toBe(false);
      expect(wrapper.find("[data-testid='users-view']").exists()).toBe(true);
    });

    it("should be dot-boundary safe", async () => {
      getRoutesApi(router).add([
        {
          name: "users2",
          path: "/users2",
          children: [{ name: "list", path: "/list" }],
        },
      ]);

      await router.start("/users2/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () =>
              h(
                RouteView.Match,
                { segment: "users" },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
          },
        ),
      );

      expect(wrapper.find("[data-testid='users']").exists()).toBe(false);
    });
  });

  describe("NotFound", () => {
    let notFoundRouter: Router;

    beforeEach(() => {
      notFoundRouter = createRouter(
        [
          { name: "test", path: "/" },
          { name: "home", path: "/home" },
          {
            name: "users",
            path: "/users",
            children: [{ name: "list", path: "/list" }],
          },
        ],
        {
          defaultRoute: "test",
          allowNotFound: true,
        },
      );
      notFoundRouter.usePlugin(browserPluginFactory({}));
    });

    afterEach(() => {
      notFoundRouter.stop();
    });

    it("should render NotFound for UNKNOWN_ROUTE", async () => {
      await notFoundRouter.start("/non-existent-path");

      const wrapper = mountRouteView(
        notFoundRouter,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () => [
              h(
                RouteView.Match,
                { segment: "users" },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
              h(RouteView.NotFound, null, {
                default: () =>
                  h("div", { "data-testid": "not-found" }, "Not Found"),
              }),
            ],
          },
        ),
      );

      expect(wrapper.find("[data-testid='users']").exists()).toBe(false);
      expect(wrapper.find("[data-testid='not-found']").exists()).toBe(true);
    });

    it("should not render NotFound for regular routes without match", async () => {
      await router.start("/about");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () => [
              h(
                RouteView.Match,
                { segment: "users" },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
              h(RouteView.NotFound, null, {
                default: () =>
                  h("div", { "data-testid": "not-found" }, "Not Found"),
              }),
            ],
          },
        ),
      );

      expect(wrapper.find("[data-testid='users']").exists()).toBe(false);
      expect(wrapper.find("[data-testid='not-found']").exists()).toBe(false);
    });
  });

  describe("Children handling", () => {
    it("should ignore non-Match/non-NotFound children", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () => [
              "some string",
              h("div", { "data-testid": "random" }, "Random"),
              null,
              h(
                RouteView.Match,
                { segment: "users" },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
            ],
          },
        ),
      );

      expect(wrapper.find("[data-testid='users']").exists()).toBe(true);
    });

    it("should collect Match from a single VNode (not array)", () => {
      const matchVNode = h(Match, { segment: "users" });
      const result: any[] = [];

      collectElements(matchVNode, result);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(Match);
    });

    it("should collect Match from nested arrays", () => {
      const matchVNode = h(Match, { segment: "users" });
      const result: any[] = [];

      collectElements([[matchVNode]], result);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(Match);
    });

    it("should collect NotFound from nested arrays", () => {
      const nfVNode = h(NotFound);
      const result: any[] = [];

      collectElements([[nfVNode]], result);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(NotFound);
    });

    it("should handle non-VNode non-array children gracefully", () => {
      const result: any[] = [];

      collectElements("just a string", result);

      expect(result).toHaveLength(0);
    });

    it("should handle undefined children gracefully", () => {
      const result: any[] = [];

      collectElements(undefined, result);

      expect(result).toHaveLength(0);
    });

    it("should support Match wrapped in Fragment", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () =>
              h(Fragment, [
                h(
                  RouteView.Match,
                  { segment: "users" },
                  {
                    default: () =>
                      h("div", { "data-testid": "users" }, "Users"),
                  },
                ),
                h(
                  RouteView.Match,
                  { segment: "about" },
                  {
                    default: () =>
                      h("div", { "data-testid": "about" }, "About"),
                  },
                ),
              ]),
          },
        ),
      );

      expect(wrapper.find("[data-testid='users']").exists()).toBe(true);
      expect(wrapper.find("[data-testid='about']").exists()).toBe(false);
    });

    it("should support Match wrapped in nested Fragments (Fragment-in-Fragment)", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () =>
              h(Fragment, [
                h(Fragment, [
                  h(Fragment, [
                    h(
                      RouteView.Match,
                      { segment: "users" },
                      {
                        default: () =>
                          h("div", { "data-testid": "deeply-nested" }, "Deep"),
                      },
                    ),
                  ]),
                ]),
              ]),
          },
        ),
      );

      expect(wrapper.find("[data-testid='deeply-nested']").exists()).toBe(true);
    });

    it("should ignore Match wrapped in custom component (vnode.type !== Match)", async () => {
      // Documents a known limitation: collectElements walks vnodes by their
      // `type` field. Match wrapped in any user-defined component is not
      // discoverable — the wrapper's render output is not inspected at the
      // static walk. Direct Match siblings still work.
      const WrapperComp = defineComponent({
        name: "WrapperComp",
        setup: () => () =>
          h(
            RouteView.Match,
            { segment: "users" },
            {
              default: () =>
                h("div", { "data-testid": "wrapped-match" }, "Wrapped"),
            },
          ),
      });

      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () => [
              h(WrapperComp),
              h(
                RouteView.Match,
                { segment: "users" },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
            ],
          },
        ),
      );

      expect(wrapper.find("[data-testid='users']").exists()).toBe(true);
      // Documents the limitation — wrapped Match is invisible to RouteView.
      expect(wrapper.find("[data-testid='wrapped-match']").exists()).toBe(
        false,
      );
    });

    it("should return null for empty RouteView", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(RouteView, { nodeName: "" }, { default: () => null }),
      );

      expect(wrapper.html()).toBe("");
    });

    it("should work with last NotFound when multiple are present", async () => {
      const notFoundRouter2 = createRouter(
        [
          { name: "test", path: "/" },
          { name: "home", path: "/home" },
        ],
        { defaultRoute: "test", allowNotFound: true },
      );

      notFoundRouter2.usePlugin(browserPluginFactory({}));
      await notFoundRouter2.start("/non-existent-path");

      const wrapper = mountRouteView(
        notFoundRouter2,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () => [
              h(RouteView.NotFound, null, {
                default: () => h("div", { "data-testid": "first-nf" }, "First"),
              }),
              h(
                RouteView.Match,
                { segment: "users" },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
              h(RouteView.NotFound, null, {
                default: () => h("div", { "data-testid": "last-nf" }, "Last"),
              }),
            ],
          },
        ),
      );

      expect(wrapper.find("[data-testid='first-nf']").exists()).toBe(false);
      expect(wrapper.find("[data-testid='last-nf']").exists()).toBe(true);

      notFoundRouter2.stop();
    });
  });

  describe("Edge cases", () => {
    it("should handle Match with no slot content", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () => h(RouteView.Match, { segment: "users" }),
          },
        ),
      );

      expect(wrapper.html()).toBe("");
    });
  });

  describe("Marker components", () => {
    it("Match renders null when used standalone", () => {
      const wrapper = mount(RouteView.Match, {
        props: { segment: "x" },
        slots: { default: () => "content" },
      });

      expect(wrapper.html()).toBe("");
    });

    it("NotFound renders null when used standalone", () => {
      const wrapper = mount(RouteView.NotFound, {
        slots: { default: () => "content" },
      });

      expect(wrapper.html()).toBe("");
    });
  });

  describe("State", () => {
    it("should return null if route is undefined (router not started)", () => {
      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () =>
              h(
                RouteView.Match,
                { segment: "users" },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
          },
        ),
      );

      expect(wrapper.find("[data-testid='users']").exists()).toBe(false);
    });
  });

  describe("Re-renders", () => {
    it("should re-render when navigating within nodeName", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "users" },
          {
            default: () => [
              h(
                RouteView.Match,
                { segment: "list" },
                {
                  default: () => h("div", { "data-testid": "list" }, "List"),
                },
              ),
              h(
                RouteView.Match,
                { segment: "view" },
                {
                  default: () => h("div", { "data-testid": "view" }, "View"),
                },
              ),
            ],
          },
        ),
      );

      expect(wrapper.find("[data-testid='list']").exists()).toBe(true);

      await router.navigate("users.view", { id: "1" });
      await flushPromises();

      expect(wrapper.find("[data-testid='list']").exists()).toBe(false);
      expect(wrapper.find("[data-testid='view']").exists()).toBe(true);
    });

    it("should not render when navigating outside nodeName", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "users" },
          {
            default: () =>
              h(
                RouteView.Match,
                { segment: "list" },
                {
                  default: () => h("div", { "data-testid": "list" }, "List"),
                },
              ),
          },
        ),
      );

      expect(wrapper.find("[data-testid='list']").exists()).toBe(true);

      await router.navigate("about");
      await flushPromises();

      expect(wrapper.find("[data-testid='list']").exists()).toBe(false);
    });
  });

  describe("NotFound with keepAlive", () => {
    let notFoundRouter: Router;

    beforeEach(() => {
      notFoundRouter = createRouter(
        [
          { name: "test", path: "/" },
          { name: "home", path: "/home" },
          {
            name: "users",
            path: "/users",
            children: [{ name: "list", path: "/list" }],
          },
        ],
        {
          defaultRoute: "test",
          allowNotFound: true,
        },
      );
      notFoundRouter.usePlugin(browserPluginFactory({}));
    });

    afterEach(() => {
      notFoundRouter.stop();
    });

    it("should render NotFound in non-keepAlive mode when route is UNKNOWN_ROUTE", async () => {
      await notFoundRouter.start("/non-existent-path");

      const wrapper = mountRouteView(
        notFoundRouter,
        h(
          RouteView,
          { nodeName: "", keepAlive: false },
          {
            default: () => [
              h(
                RouteView.Match,
                { segment: "users" },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
              h(RouteView.NotFound, null, {
                default: () =>
                  h("div", { "data-testid": "not-found" }, "Not Found"),
              }),
            ],
          },
        ),
      );

      expect(wrapper.find("[data-testid='not-found']").exists()).toBe(true);
    });

    it("should render NotFound through KeepAlive wrapper when keepAlive is true and route is UNKNOWN_ROUTE", async () => {
      await notFoundRouter.start("/non-existent-path");

      const wrapper = mountRouteView(
        notFoundRouter,
        h(
          RouteView,
          { nodeName: "", keepAlive: true },
          {
            default: () => [
              h(
                RouteView.Match,
                { segment: "users" },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
              h(RouteView.NotFound, null, {
                default: () =>
                  h("div", { "data-testid": "not-found" }, "Not Found"),
              }),
            ],
          },
        ),
      );

      expect(wrapper.find("[data-testid='not-found']").exists()).toBe(true);
    });
  });

  describe("Nested array children", () => {
    it("should handle nested arrays in children via normalizeChildren", () => {
      const matchVNode = h(Match, { segment: "users" });
      const result: any[] = [];

      collectElements([[matchVNode]], result);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(Match);
    });

    it("should handle deeply nested arrays", () => {
      const matchVNode = h(Match, { segment: "users" });
      const result: any[] = [];

      collectElements([[[matchVNode]]], result);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(Match);
    });

    it("should handle mixed array and VNode content", () => {
      const matchVNode = h(Match, { segment: "users" });
      const notFoundVNode = h(NotFound);
      const result: any[] = [];

      collectElements([matchVNode, [notFoundVNode]], result);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe(Match);
      expect(result[1].type).toBe(NotFound);
    });

    it("should skip non-VNode values in arrays", () => {
      const matchVNode = h(Match, { segment: "users" });
      const result: any[] = [];

      collectElements([matchVNode, "string", 123, null, undefined], result);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(Match);
    });
  });

  describe("Match without props", () => {
    it("should handle Match with null props (no segment prop)", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () => [
              h(
                RouteView.Match,
                { segment: "users" },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
              h(RouteView.Match, null as any, {
                default: () =>
                  h("div", { "data-testid": "fallback" }, "Fallback"),
              }),
            ],
          },
        ),
      );

      expect(wrapper.find("[data-testid='users']").exists()).toBe(true);
      expect(wrapper.find("[data-testid='fallback']").exists()).toBe(false);
    });
  });

  describe("KeepAlive with empty NotFound content", () => {
    let notFoundRouter: Router;

    beforeEach(() => {
      notFoundRouter = createRouter(
        [
          { name: "test", path: "/" },
          { name: "home", path: "/home" },
        ],
        {
          defaultRoute: "test",
          allowNotFound: true,
        },
      );
      notFoundRouter.usePlugin(browserPluginFactory({}));
    });

    afterEach(() => {
      notFoundRouter.stop();
    });

    it("should handle NotFound with no slot content in keepAlive mode", async () => {
      await notFoundRouter.start("/non-existent-path");

      const wrapper = mountRouteView(
        notFoundRouter,
        h(
          RouteView,
          { nodeName: "", keepAlive: true },
          {
            default: () => h(RouteView.NotFound),
          },
        ),
      );

      expect(wrapper.html()).toBe("");
    });

    it("should handle NotFound with no slot content in non-keepAlive mode", async () => {
      await notFoundRouter.start("/non-existent-path");

      const wrapper = mountRouteView(
        notFoundRouter,
        h(
          RouteView,
          { nodeName: "", keepAlive: false },
          {
            default: () => h(RouteView.NotFound),
          },
        ),
      );

      expect(wrapper.html()).toBe("");
    });
  });

  describe("Suspense fallback", () => {
    it("should render fallback when provided", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () =>
              h(
                RouteView.Match,
                {
                  segment: "users",
                  fallback: () =>
                    h("div", { "data-testid": "fallback" }, "Loading..."),
                },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
          },
        ),
      );

      expect(wrapper.find("[data-testid='users']").exists()).toBe(true);
    });

    it("should not render fallback when no fallback prop", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () =>
              h(
                RouteView.Match,
                { segment: "users" },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
          },
        ),
      );

      expect(wrapper.find("[data-testid='users']").exists()).toBe(true);
      expect(wrapper.find("[data-testid='fallback']").exists()).toBe(false);
    });

    it("should render fallback with keepAlive when provided", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "", keepAlive: true },
          {
            default: () =>
              h(
                RouteView.Match,
                {
                  segment: "users",
                  fallback: () =>
                    h("div", { "data-testid": "fallback" }, "Loading..."),
                },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
          },
        ),
      );

      expect(wrapper.find("[data-testid='users']").exists()).toBe(true);
    });

    it("should display fallback while async component resolves, then real content", async () => {
      const { defineAsyncComponent, nextTick } = await import("vue");

      let resolveAsync!: (
        component: ReturnType<typeof defineComponent>,
      ) => void;
      const asyncComponentPromise = new Promise<
        ReturnType<typeof defineComponent>
      >((resolve) => {
        resolveAsync = resolve;
      });

      const LazyContent = defineAsyncComponent(() => asyncComponentPromise);

      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () =>
              h(
                RouteView.Match,
                {
                  segment: "users",
                  fallback: () =>
                    h("div", { "data-testid": "fallback" }, "Loading..."),
                },
                { default: () => h(LazyContent) },
              ),
          },
        ),
      );

      // Before async resolves: Suspense renders the fallback.
      await nextTick();

      expect(wrapper.find("[data-testid='fallback']").exists()).toBe(true);

      // Resolve the async component → fallback replaced with real content.
      resolveAsync(
        defineComponent({
          setup: () => () =>
            h("div", { "data-testid": "lazy-loaded" }, "Real content"),
        }),
      );
      await flushPromises();
      await nextTick();

      expect(wrapper.find("[data-testid='fallback']").exists()).toBe(false);
      expect(wrapper.find("[data-testid='lazy-loaded']").exists()).toBe(true);
    });

    it("should render fallback as VNode when provided", async () => {
      await router.start("/users/list");

      const wrapper = mountRouteView(
        router,
        h(
          RouteView,
          { nodeName: "" },
          {
            default: () =>
              h(
                RouteView.Match,
                {
                  segment: "users",
                  fallback: h(
                    "div",
                    { "data-testid": "fallback" },
                    "Loading...",
                  ),
                },
                {
                  default: () => h("div", { "data-testid": "users" }, "Users"),
                },
              ),
          },
        ),
      );

      expect(wrapper.find("[data-testid='users']").exists()).toBe(true);
    });
  });
});
