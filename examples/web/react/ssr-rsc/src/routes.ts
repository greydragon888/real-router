import type { Route } from "@real-router/core";

import type { AppDependencies } from "./router/createAppRouter";

export const routes: Route<AppDependencies>[] = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/" },
      { name: "profile", path: "/:id" },
    ],
  },
];
