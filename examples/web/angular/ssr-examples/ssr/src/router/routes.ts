import type { Route } from "@real-router/core";

import type { CurrentUser } from "../_known-users";

export interface AppDeps {
  currentUser: CurrentUser | null;
}

export const routes: Route<AppDeps>[] = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users?sort",
    children: [
      {
        name: "profile",
        path: "/:id",
        children: [{ name: "posts", path: "/posts" }],
      },
    ],
  },
  {
    name: "dashboard",
    path: "/dashboard",
    canActivate: (_router, getDep) => () => getDep("currentUser") !== null,
  },
  {
    name: "admin",
    path: "/admin",
    canActivate: (_router, getDep) => () => {
      const user = getDep("currentUser");

      return user?.role === "admin";
    },
  },
  { name: "boom", path: "/boom" },
];
