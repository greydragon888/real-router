// tanstack search-param-scaling variant — routes with N query params
// (/sN?k1=v1&...&kN=vN). `validateSearch: (s) => s` (pass-through) keeps arbitrary
// query; the leaf reads EVERY value via `useSearch({ strict: false })` (readSearch →
// checksum) so tanstack's search object is materialized.
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useSearch,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

import {
  SEARCH_COUNTS,
  searchValues,
  readSearch,
} from "../../../_shared/search-param-spec";

import type { JSX } from "react";

function SearchLeaf(): JSX.Element {
  const search = useSearch({ strict: false });
  const { count, checksum } = readSearch(Object.entries(search));
  return (
    <main data-testid="page-search" data-count={count}>
      {count} search · Σ{checksum}
    </main>
  );
}

function Root(): JSX.Element {
  return (
    <>
      <nav>
        {SEARCH_COUNTS.map((n) => (
          <Link
            key={n}
            to={`/s${n}`}
            search={searchValues(n)}
            data-testid={`link-search-${n}`}
          >
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
const searchRoutes = SEARCH_COUNTS.map((n) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: `/s${n}`,
    validateSearch: (search: Record<string, unknown>) => search,
    component: SearchLeaf,
  }),
);

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, ...searchRoutes]),
  history: createBrowserHistory(),
});

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
