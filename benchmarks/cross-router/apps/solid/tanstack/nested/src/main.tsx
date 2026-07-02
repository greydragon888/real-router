// tanstack nested variant — shared SectionLayout (sec route, Outlet) with two
// sibling leaves a/b. Switching a↔b keeps SectionLayout mounted; Outlet swaps.
import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/solid-router";
import { render } from "solid-js/web";

import type { JSX } from "solid-js";

function Leaf(props: { n: string }): JSX.Element {
  return (
    <main data-testid="page-item" data-n={props.n}>
      <h1>{props.n}</h1>
    </main>
  );
}

function SectionLayout(): JSX.Element {
  return (
    <div class="sec">
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

const root = document.querySelector("#root");
if (root) {
  render(() => <RouterProvider router={router} />, root);
}
