// react-router v8 (Data mode) wide variant — 1000 flat sibling child routes.
import { createRoot } from "react-dom/client";
import { Link, Outlet, RouterProvider, createBrowserRouter } from "react-router";

import { CatalogItem } from "../../../_shared/pages";
import { WIDE_TARGETS, wideItems } from "../../../_shared/wide-spec";

import type { JSX } from "react";

function Layout(): JSX.Element {
  return (
    <>
      <nav>
        {WIDE_TARGETS.map((n) => (
          <Link key={n} to={`/catalog/item-${n}`} data-testid={`link-item-${n}`}>
            Item {n}
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
      {
        index: true,
        Component: () => (
          <main data-testid="page-home">
            <h1>Home</h1>
          </main>
        ),
      },
      ...wideItems.map((n) => ({
        path: `catalog/item-${n}`,
        Component: () => <CatalogItem n={String(n)} />,
      })),
    ],
  },
]);

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
