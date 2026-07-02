// tanstack params variant — routes with 1/4/16 path params ($k syntax).
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

import { PARAM_COUNTS, paramPath, paramPattern } from "../../../_shared/param-spec";

import type { JSX } from "react";

function ParamLeaf(): JSX.Element {
  const params = useParams({ strict: false });
  const count = Object.keys(params).filter((k) => /^k\d+$/.test(k)).length;
  return (
    <main data-testid="page-param" data-count={count}>
      {count} params
    </main>
  );
}

function Root(): JSX.Element {
  return (
    <>
      <nav>
        {PARAM_COUNTS.map((n) => (
          <Link key={n} to={paramPath(n)} data-testid={`link-param-${n}`}>
            {n}
          </Link>
        ))}
      </nav>
      <Outlet />
    </>
  );
}

const rootRoute = createRootRoute({ component: Root });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <main data-testid="page-home">Home</main>,
});
const paramRoutes = PARAM_COUNTS.map((n) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: paramPattern(n, "$"),
    component: ParamLeaf,
  }),
);

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, ...paramRoutes]),
  history: createBrowserHistory(),
});

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
