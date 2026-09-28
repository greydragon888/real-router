// FEATURE DEMO — data on navigation (TanStack Router). Route `loader` resolves
// on navigation; `Route.useLoaderData()` reads it.
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

import type { JSX } from "react";

function Root(): JSX.Element {
  return (
    <>
      <nav>
        <Link to="/data" data-testid="link-data">
          Data
        </Link>
      </nav>
      <Outlet />
    </>
  );
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- TanStack types these hooks through a registered router, and registration is global to the TypeScript program: this cohort's shells share one tsconfig, so each would take the others' routes (TS2717) */
function DataPage(): JSX.Element {
  const loaded = dataRoute.useLoaderData();

  return <main data-testid="loaded-value">{loaded.value}</main>;
}

const rootRoute = createRootRoute({ component: Root });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <main data-testid="page-home">Home</main>,
});
const dataRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/data",
  loader: async () => ({ value: "loaded-42" }),
  component: DataPage,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, dataRoute]),
  history: createBrowserHistory(),
});

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
