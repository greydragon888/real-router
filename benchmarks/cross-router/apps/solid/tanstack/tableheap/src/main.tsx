// tanstack table-heap variant — N flat routes under the root (?n=N).
import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/solid-router";
import { render } from "solid-js/web";

import type { JSX } from "solid-js";

const n = Number(new URLSearchParams(location.search).get("n") ?? "1");

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: (): JSX.Element => (
    <main data-testid="page-ready" data-n={String(n)}>
      ready
    </main>
  ),
});
const tableRoutes = Array.from({ length: n }, (_, i) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: `r${i}`,
    component: () => null,
  }),
);

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, ...tableRoutes]),
  history: createBrowserHistory(),
});

const root = document.querySelector("#root");
if (root) {
  render(() => <RouterProvider router={router} />, root);
}
