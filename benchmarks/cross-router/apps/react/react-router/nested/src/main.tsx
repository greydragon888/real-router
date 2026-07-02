// react-router v8 (Data mode) nested variant — shared SectionLayout (sec route,
// Outlet) with two sibling leaves a/b. Switching a↔b keeps SectionLayout
// mounted; Outlet swaps the leaf.
import { createRoot } from "react-dom/client";
import { Link, Outlet, RouterProvider, createBrowserRouter } from "react-router";

import type { JSX } from "react";

function Leaf({ n }: { n: string }): JSX.Element {
  return (
    <main data-testid="page-item" data-n={n}>
      <h1>{n}</h1>
    </main>
  );
}

function SectionLayout(): JSX.Element {
  return (
    <div className="sec">
      <nav>
        <Link to="/sec/a" data-testid="link-sec-a">
          A
        </Link>
        <Link to="/sec/b" data-testid="link-sec-b">
          B
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    children: [
      {
        index: true,
        Component: () => (
          <main data-testid="page-home">
            <h1>Home</h1>
          </main>
        ),
      },
      {
        path: "sec",
        Component: SectionLayout,
        children: [
          { path: "a", Component: () => <Leaf n="a" /> },
          { path: "b", Component: () => <Leaf n="b" /> },
        ],
      },
    ],
  },
]);

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
