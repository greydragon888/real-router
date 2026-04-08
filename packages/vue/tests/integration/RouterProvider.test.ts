import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { defineComponent, h, inject } from "vue";

import { useRoute } from "../../src/composables/useRoute";
import { useRouter } from "../../src/composables/useRouter";
import { RouteKey, RouterKey } from "../../src/context";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

describe("RouterProvider - Integration Tests", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("Basic Integration", () => {
    it("should provide router instance via RouterKey", async () => {
      await router.start("/users/list");

      let capturedRouter: Router | undefined;

      const Child = defineComponent({
        setup() {
          capturedRouter = inject(RouterKey);

          return () =>
            h(
              "div",
              { "data-testid": "has-router" },
              capturedRouter ? "yes" : "no",
            );
        },
      });

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(RouterProvider, { router }, { default: () => h(Child) }),
        }),
      );

      expect(capturedRouter).toBe(router);
      expect(wrapper.find("[data-testid='has-router']").text()).toBe("yes");
    });

    it("should render children correctly", async () => {
      await router.start("/");

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router },
              {
                default: () => [
                  h("div", { "data-testid": "child-1" }, "Child 1"),
                  h("div", { "data-testid": "child-2" }, "Child 2"),
                ],
              },
            ),
        }),
      );

      expect(wrapper.find("[data-testid='child-1']").exists()).toBe(true);
      expect(wrapper.find("[data-testid='child-2']").exists()).toBe(true);
    });

    it("should throw error when RouterKey is accessed without provider", () => {
      const ComponentWithoutProvider = defineComponent({
        setup() {
          useRouter();

          return () => h("div", "should not render");
        },
      });

      expect(() => {
        mount(ComponentWithoutProvider);
      }).toThrow("useRouter must be used within a RouterProvider");
    });
  });

  describe("Navigation Updates", () => {
    it("should update RouteKey on navigation", async () => {
      await router.start("/users/list");

      let routeName: string | undefined;
      let previousRouteName: string | undefined;

      const RouteDisplay = defineComponent({
        setup() {
          const routeCtx = inject(RouteKey);

          return () => {
            routeName = routeCtx?.route.value?.name;
            previousRouteName = routeCtx?.previousRoute.value?.name;

            return h("div", [
              h("span", { "data-testid": "current" }, routeName),
              h(
                "span",
                { "data-testid": "previous" },
                previousRouteName ?? "none",
              ),
            ]);
          };
        },
      });

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(RouterProvider, { router }, { default: () => h(RouteDisplay) }),
        }),
      );

      expect(wrapper.find("[data-testid='current']").text()).toBe("users.list");
      expect(wrapper.find("[data-testid='previous']").text()).toBe("none");

      await router.navigate("about");
      await flushPromises();

      expect(wrapper.find("[data-testid='current']").text()).toBe("about");
      expect(wrapper.find("[data-testid='previous']").text()).toBe(
        "users.list",
      );
    });
  });

  describe("Hook Integration", () => {
    it("should work with useRoute composable", async () => {
      await router.start("/users/list");

      const UseRouteComponent = defineComponent({
        setup() {
          const { route, previousRoute } = useRoute();

          return () =>
            h("div", [
              h("span", { "data-testid": "route" }, route.value?.name),
              h(
                "span",
                { "data-testid": "previous" },
                previousRoute.value?.name ?? "none",
              ),
            ]);
        },
      });

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router },
              { default: () => h(UseRouteComponent) },
            ),
        }),
      );

      expect(wrapper.find("[data-testid='route']").text()).toBe("users.list");
      expect(wrapper.find("[data-testid='previous']").text()).toBe("none");
    });

    it("should allow programmatic navigation via useRouter", async () => {
      await router.start("/users/list");

      const NavigationComponent = defineComponent({
        setup() {
          const routerFromHook = useRouter();
          const { route } = useRoute();

          return () =>
            h("div", [
              h("span", { "data-testid": "route" }, route.value?.name),
              h(
                "button",
                {
                  "data-testid": "navigate-btn",
                  onClick: () => {
                    void routerFromHook.navigate("about");
                  },
                },
                "Go to About",
              ),
            ]);
        },
      });

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router },
              { default: () => h(NavigationComponent) },
            ),
        }),
      );

      expect(wrapper.find("[data-testid='route']").text()).toBe("users.list");

      await wrapper.find("[data-testid='navigate-btn']").trigger("click");
      await flushPromises();

      expect(wrapper.find("[data-testid='route']").text()).toBe("about");
    });
  });

  describe("Nested Provider Isolation", () => {
    it("should isolate nested RouterProviders with different routers", async () => {
      const router1 = createTestRouterWithADefaultRouter();
      const router2Routes = [
        { name: "alpha", path: "/alpha" },
        { name: "beta", path: "/beta" },
      ];
      const router2 = createRouter(router2Routes, {
        defaultRoute: "alpha",
      });

      router2.usePlugin(browserPluginFactory({}));

      await router1.start("/");
      await router2.start("/alpha");

      let router2RenderCount = 0;

      const Router2Consumer = defineComponent({
        setup() {
          const { route } = useRoute();

          return () => {
            router2RenderCount++;

            return h(
              "span",
              { "data-testid": "r2-route" },
              route.value?.name ?? "none",
            );
          };
        },
      });

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router: router1 },
              {
                default: () =>
                  h(
                    RouterProvider,
                    { router: router2 },
                    {
                      default: () => h(Router2Consumer),
                    },
                  ),
              },
            ),
        }),
      );

      await flushPromises();

      const countAfterMount = router2RenderCount;

      expect(wrapper.find("[data-testid='r2-route']").text()).toBe("alpha");

      // Navigate router1 — router2 consumers should NOT update
      await router1.navigate("about");
      await flushPromises();

      expect(router2RenderCount).toBe(countAfterMount);
      expect(wrapper.find("[data-testid='r2-route']").text()).toBe("alpha");

      // Navigate router2 — router2 consumers should update
      await router2.navigate("beta");
      await flushPromises();

      expect(router2RenderCount).toBeGreaterThan(countAfterMount);
      expect(wrapper.find("[data-testid='r2-route']").text()).toBe("beta");

      router1.stop();
      router2.stop();
    });
  });

  describe("Edge Cases", () => {
    it("should handle router not started", () => {
      const RouteCapture = defineComponent({
        setup() {
          const routeCtx = inject(RouteKey);

          return () =>
            h(
              "div",
              { "data-testid": "route" },
              routeCtx?.route.value?.name ?? "no-route",
            );
        },
      });

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(RouterProvider, { router }, { default: () => h(RouteCapture) }),
        }),
      );

      expect(wrapper.find("[data-testid='route']").text()).toBe("no-route");
    });

    it("should handle unmount correctly", async () => {
      await router.start("/users/list");

      const RouteDisplay = defineComponent({
        setup() {
          const { route } = useRoute();

          return () => h("div", { "data-testid": "route" }, route.value?.name);
        },
      });

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(RouterProvider, { router }, { default: () => h(RouteDisplay) }),
        }),
      );

      expect(wrapper.find("[data-testid='route']").text()).toBe("users.list");

      wrapper.unmount();

      await router.navigate("about");

      expect(router.getState()?.name).toBe("about");
    });
  });
});
