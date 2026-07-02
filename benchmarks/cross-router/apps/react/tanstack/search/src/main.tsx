// FEATURE DEMO — typed/validated search (TanStack). `validateSearch` with a zod
// schema types the query: ?n=5 → useSearch().n is a number 5.
import {
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { z } from "zod";

import type { JSX } from "react";

const searchSchema = z.object({ n: z.coerce.number().default(1) });

function SearchPage(): JSX.Element {
  const { n } = searchRoute.useSearch();
  return (
    <main>
      <span data-testid="validated-n">{String(n)}</span>
      <span data-testid="validated-type">{typeof n}</span>
    </main>
  );
}

const rootRoute = createRootRoute({ component: Outlet });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <main data-testid="page-home">Home</main>,
});
const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  validateSearch: (search) => searchSchema.parse(search),
  component: SearchPage,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, searchRoute]),
  history: createBrowserHistory(),
});

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
