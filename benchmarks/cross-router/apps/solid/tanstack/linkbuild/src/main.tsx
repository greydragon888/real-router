// tanstack link-build variant — mount 1000 <Link>s on demand.
import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/solid-router";
import { createSignal, For } from "solid-js";
import { render } from "solid-js/web";

import type { JSX } from "solid-js";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const COUNT = _n > 0 ? _n : 1000;
const rIndexes = Array.from({ length: COUNT }, (_, i) => i);

function Home(): JSX.Element {
  const [show, setShow] = createSignal(false);
  return (
    <>
      <button data-testid="mount-links" onClick={() => setShow(true)}>
        mount
      </button>
      <main data-testid="page-ready">{show() ? "shown" : "idle"}</main>
      {show() && (
        <nav>
          <For each={rIndexes}>
            {(i) => (
              <Link
                to={`/r${i}`}
                data-testid={i === COUNT - 1 ? "last-link" : undefined}
              >
                r{i}
              </Link>
            )}
          </For>
        </nav>
      )}
    </>
  );
}

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
});
const tableRoutes = Array.from({ length: COUNT }, (_, i) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: `r${i}`,
    component: () => null,
  }),
);

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, ...tableRoutes]),
  history: createBrowserHistory(),
});

const root = document.querySelector("#root");
if (root) {
  render(() => <RouterProvider router={router} />, root);
}
