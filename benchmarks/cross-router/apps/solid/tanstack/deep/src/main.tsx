// tanstack deep variant — nested route tree to DEEP_DEPTH (getParentRoute chain).
// Each level: a layout route (Outlet) + an index leaf ("/") for the terminal.
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
import { DEEP_DEPTH, DEEP_TARGETS, deepPath } from "../../../_shared/deep-spec";

import type { AnyRoute } from "@tanstack/solid-router";
import type { JSX } from "solid-js";

function LevelLayout(): JSX.Element {
  return (
    <div class="lvl">
      <Outlet />
    </div>
  );
}

const rootRoute = createRootRoute({ component: Outlet });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <nav>
      <For each={DEEP_TARGETS}>
        {(d) => (
          <Link to={deepPath(d)} data-testid={`link-deep-${d}`}>
            Depth {d}
          </Link>
        )}
      </For>
    </nav>
  ),
});

const deepRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deep",
  component: LevelLayout,
});

function buildLevel(k: number, parent: AnyRoute): AnyRoute {
  const route = createRoute({
    getParentRoute: () => parent,
    path: `l${k}`,
    component: LevelLayout,
  });
  const leaf = createRoute({
    getParentRoute: () => route,
    path: "/",
    component: () => <CatalogItem n={String(k)} />,
  });
  const children: AnyRoute[] = [leaf];
  if (k < DEEP_DEPTH) children.push(buildLevel(k + 1, route));
  route.addChildren(children);
  return route;
}

deepRoute.addChildren([buildLevel(1, deepRoute)]);

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, deepRoute]),
  history: createBrowserHistory(),
});

const root = document.querySelector("#root");
if (root) {
  render(() => <RouterProvider router={router} />, root);
}
