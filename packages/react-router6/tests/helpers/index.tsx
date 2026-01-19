import { createRouter } from "router6";
import { browserPluginFactory } from "router6-plugin-browser";

import type { Router } from "router6";

export const createTestRouter = (): Router => {
  const router = createRouter([]);

  router.usePlugin(browserPluginFactory());

  return router;
};

/**
 * Creates a test router with default configuration and routes
 */
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
    caseSensitive: false,
    queryParamsMode: "loose",
  });

  router.usePlugin(
    browserPluginFactory({
      useHash: false,
    }),
  );

  return router;
}

/**
 * Creates a large router for performance testing
 */
export function createLargeRouter(routeCount = 100): Router {
  const routes = [];

  // Generate many top-level routes
  for (let i = 0; i < routeCount; i++) {
    routes.push({
      name: `route${i}`,
      path: `/route${i}`,
      children: [
        { name: "list", path: "/list" },
        { name: "view", path: "/:id" },
        { name: "edit", path: "/:id/edit" },
        { name: "delete", path: "/:id/delete" },
      ],
    });
  }

  return createRouter(routes, {
    defaultRoute: "route0",
  });
}
