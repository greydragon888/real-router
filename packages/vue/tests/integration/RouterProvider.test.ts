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
