// @tanstack/solid-router search-param-scaling variant — routes with N query params
// (/sN?k1=v1&...&kN=vN). `validateSearch: (s) => s` keeps arbitrary query; the leaf
// reads EVERY value via `useSearch({ strict: false })` (an ACCESSOR → search()).
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useSearch,
} from "@tanstack/solid-router";
import { For, createMemo } from "solid-js";
import { render } from "solid-js/web";

import {
  SEARCH_COUNTS,
  searchValues,
  readSearch,
} from "../../../_shared/search-param-spec";

import type { JSX } from "solid-js";

function SearchLeaf(): JSX.Element {
  const search = useSearch({ strict: false });
  const info = createMemo(() => readSearch(Object.entries(search())));
  return (
    <main data-testid="page-search" data-count={info().count}>
      {info().count} search · Σ{info().checksum}
    </main>
  );
}

function Root(): JSX.Element {
  return (
    <>
      <nav>
        <For each={SEARCH_COUNTS}>
          {(n) => (
            <Link
              to={`/s${n}`}
              search={searchValues(n)}
              data-testid={`link-search-${n}`}
            >
              {n}
            </Link>
          )}
        </For>
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

const root = document.querySelector("#root");
if (root) {
  render(() => <RouterProvider router={router} />, root);
}
