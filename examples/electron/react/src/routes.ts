import type { Route } from "@real-router/core";

export const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "dashboard", path: "/dashboard" },
  { name: "settings", path: "/settings" },
  {
    name: "users",
    path: "/users",
    children: [
      {
        name: "user",
        path: "/:id",
        children: [{ name: "edit", path: "/edit" }],
      },
    ],
  },
];
