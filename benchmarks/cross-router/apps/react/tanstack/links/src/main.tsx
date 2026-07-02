// tanstack links variant — 100 <Link activeProps> to sibling /tab/i routes.
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

import { tabs } from "../../../_shared/links-spec";

import type { JSX } from "react";

function TabPage({ n }: { n: string }): JSX.Element {
  return (
    <main data-testid="page-tab" data-n={n}>
      <h1>Tab {n}</h1>
    </main>
  );
}

function Root() {
  return (
    <>
      <nav>
        {tabs.map((i) => (
          <Link
            key={i}
            to={`/tab/${i}`}
            activeProps={{ className: "active" }}
            data-testid={`link-tab-${i}`}
          >
            Tab {i}
          </Link>
        ))}
      </nav>
      <Outlet />
    </>
  );
}

const rootRoute = createRootRoute({ component: Root });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <main data-testid="page-home">
      <h1>Home</h1>
    </main>
  ),
});
const tabRoutes = tabs.map((i) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: `/tab/${i}`,
    component: () => <TabPage n={String(i)} />,
  }),
);

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, ...tabRoutes]),
  history: createBrowserHistory(),
});

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
