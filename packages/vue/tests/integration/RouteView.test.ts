import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { defineComponent, h, ref, onActivated, onDeactivated } from "vue";

import { RouteView } from "../../src/components/RouteView";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

describe("RouteView - Integration Tests", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("Nested RouteView", () => {
    function createNestedApp() {
      return mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router },
              {
                default: () =>
                  h(
                    RouteView,
                    { nodeName: "" },
                    {
                      default: () => [
                        h(
                          RouteView.Match,
                          { segment: "users" },
                          {
                            default: () =>
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
                                          h(
                                            "div",
                                            { "data-testid": "users-list" },
                                            "Users List",
                                          ),
                                      },
                                    ),
                                    h(
                                      RouteView.Match,
                                      { segment: "view" },
                                      {
                                        default: () =>
                                          h(
                                            "div",
                                            { "data-testid": "users-view" },
                                            "Users View",
                                          ),
                                      },
                                    ),
                                    h(
                                      RouteView.Match,
                                      { segment: "edit" },
                                      {
                                        default: () =>
                                          h(
                                            "div",
                                            { "data-testid": "users-edit" },
                                            "Users Edit",
                                          ),
                                      },
                                    ),
                                  ],
                                },
                              ),
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
                        h(
                          RouteView.Match,
                          { segment: "home" },
                          {
                            default: () =>
                              h("div", { "data-testid": "home" }, "Home"),
                          },
                        ),
                      ],
                    },
                  ),
              },
            ),
        }),
      );
    }

    it("should render correct nested chain", async () => {
      await router.start("/users/list");

      const wrapper = createNestedApp();

      expect(wrapper.find("[data-testid='users-list']").exists()).toBe(true);
      expect(wrapper.find("[data-testid='users-view']").exists()).toBe(false);
      expect(wrapper.find("[data-testid='about']").exists()).toBe(false);
    });

    it("should switch Match at root level on navigation", async () => {
      await router.start("/users/list");

      const wrapper = createNestedApp();

      expect(wrapper.find("[data-testid='users-list']").exists()).toBe(true);

      await router.navigate("about");
      await flushPromises();

      expect(wrapper.find("[data-testid='users-list']").exists()).toBe(false);
      expect(wrapper.find("[data-testid='about']").exists()).toBe(true);
    });

    it("should switch nested Match on navigation", async () => {
      await router.start("/users/list");

      const wrapper = createNestedApp();

      expect(wrapper.find("[data-testid='users-list']").exists()).toBe(true);

      await router.navigate("users.view", { id: "1" });
      await flushPromises();

      expect(wrapper.find("[data-testid='users-list']").exists()).toBe(false);
      expect(wrapper.find("[data-testid='users-view']").exists()).toBe(true);

      await router.navigate("users.edit", { id: "1" });
      await flushPromises();

      expect(wrapper.find("[data-testid='users-view']").exists()).toBe(false);
      expect(wrapper.find("[data-testid='users-edit']").exists()).toBe(true);
    });
  });

  describe("NotFound with allowNotFound", () => {
    let notFoundRouter: Router;

    beforeEach(() => {
      notFoundRouter = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users",
            path: "/users",
            children: [{ name: "list", path: "/list" }],
          },
          { name: "about", path: "/about" },
        ],
        { defaultRoute: "home", allowNotFound: true },
      );
      notFoundRouter.usePlugin(browserPluginFactory({}));
    });

    afterEach(() => {
      notFoundRouter.stop();
    });

    it("should render NotFound when navigating to unknown route", async () => {
      await notFoundRouter.start("/non-existent");

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router: notFoundRouter },
              {
                default: () =>
                  h(
                    RouteView,
                    { nodeName: "" },
                    {
                      default: () => [
                        h(
                          RouteView.Match,
                          { segment: "users" },
                          {
                            default: () =>
                              h("div", { "data-testid": "users" }, "Users"),
                          },
                        ),
                        h(RouteView.NotFound, null, {
                          default: () =>
                            h("div", { "data-testid": "not-found" }, "404"),
                        }),
                      ],
                    },
                  ),
              },
            ),
        }),
      );

      expect(wrapper.find("[data-testid='not-found']").exists()).toBe(true);
      expect(wrapper.find("[data-testid='users']").exists()).toBe(false);
    });
  });

  describe("Multiple RouteView at same level", () => {
    it("should work independently", async () => {
      await router.start("/users/list");

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router },
              {
                default: () => [
                  h(
                    RouteView,
                    { nodeName: "" },
                    {
                      default: () => [
                        h(
                          RouteView.Match,
                          { segment: "users" },
                          {
                            default: () =>
                              h(
                                "div",
                                { "data-testid": "nav-users" },
                                "Nav Users",
                              ),
                          },
                        ),
                        h(
                          RouteView.Match,
                          { segment: "about" },
                          {
                            default: () =>
                              h(
                                "div",
                                { "data-testid": "nav-about" },
                                "Nav About",
                              ),
                          },
                        ),
                      ],
                    },
                  ),
                  h(
                    RouteView,
                    { nodeName: "" },
                    {
                      default: () => [
                        h(
                          RouteView.Match,
                          { segment: "users" },
                          {
                            default: () =>
                              h(
                                "div",
                                { "data-testid": "content-users" },
                                "Content Users",
                              ),
                          },
                        ),
                        h(
                          RouteView.Match,
                          { segment: "about" },
                          {
                            default: () =>
                              h(
                                "div",
                                { "data-testid": "content-about" },
                                "Content About",
                              ),
                          },
                        ),
                      ],
                    },
                  ),
                ],
              },
            ),
        }),
      );

      expect(wrapper.find("[data-testid='nav-users']").exists()).toBe(true);
      expect(wrapper.find("[data-testid='content-users']").exists()).toBe(true);

      await router.navigate("about");
      await flushPromises();

      expect(wrapper.find("[data-testid='nav-about']").exists()).toBe(true);
      expect(wrapper.find("[data-testid='content-about']").exists()).toBe(true);
    });
  });

  describe("KeepAlive", () => {
    it("should preserve component state when switching routes with keepAlive", async () => {
      await router.start("/users/list");

      const Counter = defineComponent({
        setup() {
          const count = ref(0);

          return () =>
            h("div", [
              h("span", { "data-testid": "count" }, String(count.value)),
              h(
                "button",
                {
                  "data-testid": "increment",
                  onClick: () => {
                    count.value++;
                  },
                },
                "+",
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
              {
                default: () =>
                  h(
                    RouteView,
                    { nodeName: "", keepAlive: true },
                    {
                      default: () => [
                        h(
                          RouteView.Match,
                          { segment: "users" },
                          { default: () => h(Counter) },
                        ),
                        h(
                          RouteView.Match,
                          { segment: "about" },
                          {
                            default: () =>
                              h(
                                "div",
                                { "data-testid": "about" },
                                "About Page",
                              ),
                          },
                        ),
                      ],
                    },
                  ),
              },
            ),
        }),
      );

      expect(wrapper.find("[data-testid='count']").text()).toBe("0");

      await wrapper.find("[data-testid='increment']").trigger("click");
      await flushPromises();

      expect(wrapper.find("[data-testid='count']").text()).toBe("1");

      await router.navigate("about");
      await flushPromises();

      expect(wrapper.find("[data-testid='about']").exists()).toBe(true);

      await router.navigate("users.list");
      await flushPromises();

      expect(wrapper.find("[data-testid='count']").text()).toBe("1");
    });

    it("should call onActivated/onDeactivated lifecycle hooks", async () => {
      await router.start("/users/list");

      const activatedCalls: string[] = [];
      const deactivatedCalls: string[] = [];

      const UsersComponent = defineComponent({
        setup() {
          onActivated(() => {
            activatedCalls.push("users");
          });
          onDeactivated(() => {
            deactivatedCalls.push("users");
          });

          return () => h("div", { "data-testid": "users-content" }, "Users");
        },
      });

      mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router },
              {
                default: () =>
                  h(
                    RouteView,
                    { nodeName: "", keepAlive: true },
                    {
                      default: () => [
                        h(
                          RouteView.Match,
                          { segment: "users" },
                          { default: () => h(UsersComponent) },
                        ),
                        h(
                          RouteView.Match,
                          { segment: "about" },
                          {
                            default: () =>
                              h("div", { "data-testid": "about" }, "About"),
                          },
                        ),
                      ],
                    },
                  ),
              },
            ),
        }),
      );

      await router.navigate("about");
      await flushPromises();

      expect(deactivatedCalls).toContain("users");

      await router.navigate("users.list");
      await flushPromises();

      expect(activatedCalls).toContain("users");
    });

    it("should render content without keepAlive (no state preservation)", async () => {
      await router.start("/users/list");

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router },
              {
                default: () =>
                  h(
                    RouteView,
                    { nodeName: "", keepAlive: false },
                    {
                      default: () => [
                        h(
                          RouteView.Match,
                          { segment: "users" },
                          {
                            default: () =>
                              h(
                                "div",
                                { "data-testid": "users" },
                                "Users Content",
                              ),
                          },
                        ),
                        h(
                          RouteView.Match,
                          { segment: "about" },
                          {
                            default: () =>
                              h(
                                "div",
                                { "data-testid": "about" },
                                "About Content",
                              ),
                          },
                        ),
                      ],
                    },
                  ),
              },
            ),
        }),
      );

      expect(wrapper.find("[data-testid='users']").exists()).toBe(true);

      await router.navigate("about");
      await flushPromises();

      expect(wrapper.find("[data-testid='users']").exists()).toBe(false);
      expect(wrapper.find("[data-testid='about']").exists()).toBe(true);
    });
  });

  describe("NotFound as active child with keepAlive", () => {
    it("should render NotFound when it is the active match with keepAlive enabled", async () => {
      const notFoundRouter = createRouter(
        [
          { name: "home", path: "/" },
          { name: "users", path: "/users" },
        ],
        { defaultRoute: "home", allowNotFound: true },
      );

      notFoundRouter.usePlugin(browserPluginFactory({}));
      await notFoundRouter.start("/unknown");

      const wrapper = mount(
        defineComponent({
          setup: () => () =>
            h(
              RouterProvider,
              { router: notFoundRouter },
              {
                default: () =>
                  h(
                    RouteView,
                    { nodeName: "", keepAlive: true },
                    {
                      default: () => [
                        h(
                          RouteView.Match,
                          { segment: "users" },
                          {
                            default: () =>
                              h("div", { "data-testid": "users" }, "Users"),
                          },
                        ),
                        h(RouteView.NotFound, null, {
                          default: () =>
                            h("div", { "data-testid": "not-found" }, "404"),
                        }),
                      ],
                    },
                  ),
              },
            ),
        }),
      );

      expect(wrapper.find("[data-testid='not-found']").exists()).toBe(true);
      expect(wrapper.find("[data-testid='users']").exists()).toBe(false);

      notFoundRouter.stop();
    });
  });
});
