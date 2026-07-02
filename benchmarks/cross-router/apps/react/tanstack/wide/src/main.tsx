// tanstack wide variant — 1000 flat sibling routes added to the route tree.
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

import { CatalogItem } from "../../../_shared/pages";
import { WIDE_TARGETS, wideItems } from "../../../_shared/wide-spec";

function Root() {
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

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
