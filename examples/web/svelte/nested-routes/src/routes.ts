import type { Route } from "@real-router/core";

export const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    forwardTo: "users.list",
    children: [
      { name: "list", path: "/list" },
      { name: "profile", path: "/:id" },
      { name: "settings", path: "/settings" },
    ],
  },
];
