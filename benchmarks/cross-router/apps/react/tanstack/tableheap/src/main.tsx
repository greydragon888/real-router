// tanstack table-heap variant — N flat routes under the root (?n=N).
import {
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

import type { JSX } from "react";

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

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
