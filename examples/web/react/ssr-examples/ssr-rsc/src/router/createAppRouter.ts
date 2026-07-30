import { createRouter } from "@real-router/core";

import type { Database } from "../database";
import type { Route, Router } from "@real-router/core";

export interface AppDependencies {
  db: Database;
}

export const routes: Route<AppDependencies>[] = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      // ?role declares `role` as a query parameter; available as state.search.role.
      { name: "list", path: "/?role" },
      { name: "profile", path: "/:id" },
    ],
  },
  // Error-path demonstration: loader rejects, entry catches, returns 500.
  { name: "boom", path: "/boom" },
];

export function createAppRouter(
  deps?: AppDependencies,
): Router<AppDependencies> {
  return createRouter<AppDependencies>(
    routes,
    { defaultRoute: "home", allowNotFound: true },
    deps,
  );
}
