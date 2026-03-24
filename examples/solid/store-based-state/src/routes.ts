import type { Route } from "@real-router/core";

export const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    forwardTo: "users.profile",
    children: [
      { name: "profile", path: "/:id" },
    ],
  },
];
