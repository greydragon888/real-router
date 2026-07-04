// react-router v8 (Data mode) search-param-scaling variant — routes with N query
// params (/sN?k1=v1&...&kN=vN). react-router exposes query LAZILY via
// `useSearchParams()` (a URLSearchParams). The leaf reads EVERY value (readSearch →
// checksum) so the lazy query is actually materialized — apples-to-apples with
// real-router's eager `route.params`.
import { createRoot } from "react-dom/client";
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useSearchParams,
} from "react-router";

import {
  SEARCH_COUNTS,
  searchQuery,
  readSearch,
} from "../../../_shared/search-param-spec";

import type { JSX } from "react";

function SearchLeaf(): JSX.Element {
  const [sp] = useSearchParams();
  const { count, checksum } = readSearch(sp.entries());
  return (
    <main data-testid="page-search" data-count={count}>
      {count} search · Σ{checksum}
    </main>
  );
}

function Layout(): JSX.Element {
  return (
    <>
      <nav>
        {SEARCH_COUNTS.map((n) => (
          <Link
            key={n}
            to={`/s${n}?${searchQuery(n)}`}
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

const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: () => <main data-testid="page-home">Home</main> },
      ...SEARCH_COUNTS.map((n) => ({ path: `s${n}`, Component: SearchLeaf })),
    ],
  },
]);

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
