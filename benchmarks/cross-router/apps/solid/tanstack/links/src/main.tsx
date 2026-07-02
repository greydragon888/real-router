// tanstack links variant — 100 <Link activeProps> to sibling /tab/i routes.
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

import { tabs } from "../../../_shared/links-spec";

import type { JSX } from "solid-js";

function TabPage(props: { n: string }): JSX.Element {
  return (
    <main data-testid="page-tab" data-n={props.n}>
      <h1>Tab {props.n}</h1>
    </main>
  );
}

function Root(): JSX.Element {
  return (
    <>
      <nav>
        <For each={tabs}>
          {(i) => (
            <Link
              to={`/tab/${i}`}
              activeProps={{ class: "active" }}
              data-testid={`link-tab-${i}`}
            >
              Tab {i}
            </Link>
          )}
        </For>
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

const root = document.querySelector("#root");
if (root) {
  render(() => <RouterProvider router={router} />, root);
}
