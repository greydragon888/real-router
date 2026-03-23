import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter, getNavigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";
import { render } from "@testing-library/svelte";

import type { Router } from "@real-router/core";

export const createTestRouter = (): Router => {
  const router = createRouter([]);

  router.usePlugin(browserPluginFactory());

  return router;
};

export function createTestRouterWithADefaultRouter(): Router {
  const routes = [
    { name: "test", path: "/" },
    { name: "home", path: "/home" },
    { name: "one-more-test", path: "/test" },
    {
      name: "items",
      path: "/items",
      children: [{ name: "item", path: "/:id" }],
    },
    {
      name: "users",
      path: "/users",
      children: [
        { name: "list", path: "/list" },
        { name: "view", path: "/:id" },
        { name: "edit", path: "/:id/edit" },
      ],
    },
    { name: "about", path: "/about" },
  ];

  const router = createRouter(routes, {
    defaultRoute: "test",
    trailingSlash: "never",
    queryParamsMode: "loose",
  });

  router.usePlugin(browserPluginFactory({}));

  return router;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function renderWithRouter(
  router: Router,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component: any,
  props: Record<string, unknown> = {},
) {
  const navigator = getNavigator(router);
  const source = createRouteSource(router);

  // Eagerly subscribe so getSnapshot() returns latest values
  const unsub = source.subscribe(() => {});

  const context = new Map<string, unknown>([
    ["real-router:router", router],
    ["real-router:navigator", navigator],
    [
      "real-router:route",
      {
        navigator,
        get route() {
          return {
            get current() {
              return source.getSnapshot().route;
            },
          };
        },
        get previousRoute() {
          return {
            get current() {
              return source.getSnapshot().previousRoute;
            },
          };
        },
      },
    ],
  ]);

  const result = render(Component, { props, context });

  const originalUnmount = result.unmount;

  result.unmount = () => {
    unsub();
    originalUnmount();
  };

  return result;
}
