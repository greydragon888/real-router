import type { Route } from "@real-router/core";

export const baseRoutes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

export const analyticsRoute: Route = {
  name: "analytics",
  path: "/analytics",
};

export const adminRoutes: Route[] = [
  {
    name: "admin",
    path: "/admin",
    children: [
      { name: "users", path: "/users" },
      { name: "settings", path: "/settings" },
    ],
  },
];
