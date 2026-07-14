// react-router v8 (Data mode) nested variant — shared layout chain of DEPTH D
// (from `?n=`, default 1) with sibling leaves a/b at the bottom. Switching a↔b
// keeps the D-deep chain mounted; each Outlet swaps only its child.
import { createRoot } from "react-dom/client";
import { Link, Outlet, RouterProvider, createBrowserRouter } from "react-router";

import type { JSX } from "react";
import type { RouteObject } from "react-router";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const DEPTH = _n > 0 ? _n : 1;
const deepPrefix =
  "/sec" + Array.from({ length: DEPTH - 1 }, (_, i) => `/l${i + 2}`).join("");

function Leaf({ n }: { n: string }): JSX.Element {
  return (
    <main data-testid="page-item" data-n={n}>
      <h1>{n}</h1>
    </main>
  );
}

function BottomLayout(): JSX.Element {
  return (
    <div className="sec">
      <nav>
        <Link to={`${deepPrefix}/a`} data-testid="link-sec-a">
          A
        </Link>
        <Link to={`${deepPrefix}/b`} data-testid="link-sec-b">
          B
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}

function PassLayout(): JSX.Element {
  return (
    <div className="lvl">
      <Outlet />
    </div>
  );
}

function secSubtree(): RouteObject {
  const children: RouteObject[] = [
    { path: "a", Component: () => <Leaf n="a" /> },
    { path: "b", Component: () => <Leaf n="b" /> },
  ];
  let node: RouteObject = {
    path: DEPTH === 1 ? "sec" : `l${DEPTH}`,
    Component: BottomLayout,
    children,
  };
  for (let k = DEPTH - 1; k >= 1; k--) {
    node = {
      path: k === 1 ? "sec" : `l${k}`,
      Component: PassLayout,
      children: [node],
    };
  }
  return node;
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
      secSubtree(),
    ],
  },
]);

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
