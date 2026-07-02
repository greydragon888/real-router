// tanstack nested variant — shared SectionLayout (sec route, Outlet) with two
// sibling leaves a/b. Switching a↔b keeps SectionLayout mounted; Outlet swaps.
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

function Leaf({ n }: { n: string }): JSX.Element {
  return (
    <main data-testid="page-item" data-n={n}>
      <h1>{n}</h1>
    </main>
  );
}

function SectionLayout() {
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

const rootRoute = createRootRoute({ component: Outlet });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <main data-testid="page-home">
      <h1>Home</h1>
    </main>
  ),
});
const secRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sec",
  component: SectionLayout,
});
const aRoute = createRoute({
  getParentRoute: () => secRoute,
  path: "a",
  component: () => <Leaf n="a" />,
});
const bRoute = createRoute({
  getParentRoute: () => secRoute,
  path: "b",
  component: () => <Leaf n="b" />,
});
secRoute.addChildren([aRoute, bRoute]);

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, secRoute]),
  history: createBrowserHistory(),
});

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
