// tanstack params variant — routes with 1/10/100 path params ($k syntax).
// solid-router's global useParams({ strict: false }) returns an ACCESSOR, so the
// param object is read via params() (unlike react-router, where it is the value).
import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useParams,
} from "@tanstack/solid-router";
import { For } from "solid-js";
import { render } from "solid-js/web";

import { PARAM_COUNTS, paramPath, paramPattern } from "../../../_shared/param-spec";

import type { JSX } from "solid-js";

function ParamLeaf(): JSX.Element {
  const params = useParams({ strict: false });
  const count = () =>
    Object.keys(params()).filter((k) => /^k\d+$/.test(k)).length;
  return (
    <main data-testid="page-param" data-count={count()}>
      {count()} params
    </main>
  );
}

function Root(): JSX.Element {
  return (
    <>
      <nav>
        <For each={PARAM_COUNTS}>
          {(n) => (
            <Link to={paramPath(n)} data-testid={`link-param-${n}`}>
              {n}
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
  component: () => <main data-testid="page-home">Home</main>,
});
const paramRoutes = PARAM_COUNTS.map((n) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: paramPattern(n, "$"),
    component: ParamLeaf,
  }),
);

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, ...paramRoutes]),
  history: createBrowserHistory(),
});

const root = document.querySelector("#root");
if (root) {
  render(() => <RouterProvider router={router} />, root);
}
