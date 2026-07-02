// react-router v8 (Data mode) params variant — routes with 1/4/16 path params.
import { createRoot } from "react-dom/client";
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useParams,
} from "react-router";

import { PARAM_COUNTS, paramPath, paramPattern } from "../../../_shared/param-spec";

import type { JSX } from "react";

function ParamLeaf(): JSX.Element {
  const params = useParams();
  const count = Object.keys(params).filter((k) => /^k\d+$/.test(k)).length;
  return (
    <main data-testid="page-param" data-count={count}>
      {count} params
    </main>
  );
}

function Layout(): JSX.Element {
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

const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: () => <main data-testid="page-home">Home</main> },
      ...PARAM_COUNTS.map((n) => ({
        // child path: drop the leading "/" from the pattern
        path: paramPattern(n, ":").slice(1),
        Component: ParamLeaf,
      })),
    ],
  },
]);

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
