import type { Route } from "@real-router/core";

export const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      {
        name: "profile",
        path: "/:id",
        children: [{ name: "settings", path: "/settings" }],
      },
    ],
  },
];
