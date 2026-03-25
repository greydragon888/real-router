import { createRouter } from "@real-router/core";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Options, Route, Router } from "@real-router/core";

export const TEST_ROUTES: Route[] = [
  { name: "index", path: "/" },
  { name: "home", path: "/home" },
  { name: "items", path: "/items/:id" },
  {
    name: "admin",
    path: "/admin",
    children: [{ name: "dashboard", path: "/dashboard" }],
  },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "view", path: "/view/:id" },
      { name: "list", path: "/list" },
    ],
  },
  {
    name: "settings",
    path: "/settings",
    children: [
      { name: "account", path: "/account" },
      { name: "privacy", path: "/privacy" },
    ],
  },
];

export function createValidationRouter(options?: Partial<Options>): Router {
  const router = createRouter(TEST_ROUTES, {
    defaultRoute: "home",
    ...options,
  });

  router.usePlugin(validationPlugin());

  return router;
}
