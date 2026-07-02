// tanstack wide variant — 1000 flat sibling routes added to the route tree.
import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/solid-router";
import { For } from "solid-js";
import { render } from "solid-js/web";

import { CatalogItem } from "../../../_shared/pages";
import { WIDE_TARGETS, wideItems } from "../../../_shared/wide-spec";

import type { JSX } from "solid-js";

function Root(): JSX.Element {
  return (
    <>
      <nav>
        <For each={WIDE_TARGETS}>
          {(n) => (
            <Link to={`/catalog/item-${n}`} data-testid={`link-item-${n}`}>
              Item {n}
            </Link>
          )}
        </For>
      </nav>
      <Outlet />
    </>
  );
}

const rootRoute = createRootRoute({ component: Root });
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <main data-testid="page-home">
      <h1>Home</h1>
    </main>
  ),
});
const itemRoutes = wideItems.map((n) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: `/catalog/item-${n}`,
    component: () => <CatalogItem n={String(n)} />,
  }),
);

const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, ...itemRoutes]),
  history: createBrowserHistory(),
});

const root = document.querySelector("#root");
if (root) {
  render(() => <RouterProvider router={router} />, root);
}
