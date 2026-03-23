import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { defineComponent, h } from "vue";

import { useRouteNode } from "../../src/composables/useRouteNode";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

function mountWithRouter(router: Router, content: () => unknown) {
  return mount(
    defineComponent({
      setup: () => () => h(RouterProvider, { router }, { default: content }),
    }),
  );
}

describe("useRouteNode - Integration Tests", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("Component Integration", () => {
    it("should work in a real component", async () => {
      await router.start("/users/list");

      const UsersList = defineComponent({
        setup() {
          const { route } = useRouteNode("users");

          return () => {
            if (!route.value) {
              return h("div", { "data-testid": "no-route" }, "No route");
            }

            return h("div", { "data-testid": "route-name" }, route.value.name);
          };
        },
      });

      const wrapper = mountWithRouter(router, () => h(UsersList));

      expect(wrapper.find("[data-testid='route-name']").text()).toBe(
        "users.list",
      );
    });

    it("should support conditional rendering based on node activity", async () => {
      await router.start("/about");

      const UsersSection = defineComponent({
        setup() {
          const { route } = useRouteNode("users");

          return () => {
            if (!route.value) {
              return h(
                "div",
                { "data-testid": "inactive" },
                "Users section inactive",
              );
            }

            return h(
              "div",
              { "data-testid": "active" },
              `Users: ${route.value.name}`,
            );
          };
        },
      });

      const wrapper = mountWithRouter(router, () => h(UsersSection));

      expect(wrapper.find("[data-testid='inactive']").exists()).toBe(true);

      await router.navigate("users.list");
      await flushPromises();

      expect(wrapper.find("[data-testid='active']").text()).toBe(
        "Users: users.list",
      );
    });

    it("should update component when route params change", async () => {
      await router.start("/users/list");

      const UserView = defineComponent({
        setup() {
          const { route } = useRouteNode("users");

          return () => {
            const id =
              route.value?.params &&
              typeof route.value.params === "object" &&
              "id" in route.value.params &&
              typeof route.value.params.id === "string"
                ? route.value.params.id
                : "no-id";

            return h("div", { "data-testid": "user-id" }, id);
          };
        },
      });

      const wrapper = mountWithRouter(router, () => h(UserView));

      expect(wrapper.find("[data-testid='user-id']").text()).toBe("no-id");

      await router.navigate("users.view", { id: "123" });
      await flushPromises();

      expect(wrapper.find("[data-testid='user-id']").text()).toBe("123");

      await router.navigate("users.view", { id: "456" });
      await flushPromises();

      expect(wrapper.find("[data-testid='user-id']").text()).toBe("456");
    });

    it("should provide navigator for programmatic navigation", async () => {
      await router.start("/users/list");

      const NavigationComponent = defineComponent({
        setup() {
          const { navigator: contextNavigator, route } = useRouteNode("users");

          return () =>
            h("div", [
              h(
                "span",
                { "data-testid": "current-route" },
                route.value?.name ?? "none",
              ),
              h(
                "button",
                {
                  "data-testid": "navigate-btn",
                  onClick: () => {
                    void contextNavigator.navigate("users.view", { id: "1" });
                  },
                },
                "Navigate",
              ),
            ]);
        },
      });

      const wrapper = mountWithRouter(router, () => h(NavigationComponent));

      expect(wrapper.find("[data-testid='current-route']").text()).toBe(
        "users.list",
      );

      await wrapper.find("[data-testid='navigate-btn']").trigger("click");
      await flushPromises();

      expect(wrapper.find("[data-testid='current-route']").text()).toBe(
        "users.view",
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle non-existent node subscription", async () => {
      await router.start("/users/list");

      let result: any;
      const App = defineComponent({
        setup() {
          result = useRouteNode("nonexistent.node.path");

          return () => h("div");
        },
      });

      mountWithRouter(router, () => h(App));

      expect(result.route.value).toBeUndefined();
      expect(result.navigator).toBeDefined();
    });

    it("should handle rapid navigation", async () => {
      await router.start("/users/list");

      let result: any;
      const App = defineComponent({
        setup() {
          result = useRouteNode("users");

          return () => h("div");
        },
      });

      mountWithRouter(router, () => h(App));

      await router.navigate("users.view", { id: "1" });
      await router.navigate("users.edit", { id: "1" });
      await router.navigate("users.view", { id: "2" });
      await flushPromises();

      expect(result.route.value?.name).toBe("users.view");
      expect(result.route.value?.params).toStrictEqual({ id: "2" });
    });

    it("should maintain navigator reference across navigations", async () => {
      await router.start("/users/list");

      let result: any;
      const App = defineComponent({
        setup() {
          result = useRouteNode("users");

          return () => h("div");
        },
      });

      mountWithRouter(router, () => h(App));

      const initialNavigator = result.navigator;

      await router.navigate("users.view", { id: "1" });
      await flushPromises();

      expect(result.navigator).toBe(initialNavigator);
    });
  });
});
