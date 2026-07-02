// tanstack deep variant — nested route tree to depth 20 (getParentRoute chain).
// Each level: a layout route (Outlet) + an index leaf ("/") for the terminal.
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
import { DEEP_DEPTH, DEEP_TARGETS, deepPath } from "../../../_shared/deep-spec";

import type { AnyRoute } from "@tanstack/react-router";

function LevelLayout() {
  return (
    <div className="lvl">
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
      {DEEP_TARGETS.map((d) => (
        <Link key={d} to={deepPath(d)} data-testid={`link-deep-${d}`}>
          Depth {d}
        </Link>
      ))}
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

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
