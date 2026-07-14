// @tanstack/react-router nested variant — shared layout chain of DEPTH D (from
// `?n=`, default 1) with sibling leaves a/b at the bottom; each Outlet swaps only
// its child, so the D-deep chain stays mounted across a↔b.
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

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const DEPTH = _n > 0 ? _n : 1;
const deepPrefix =
  "/sec" + Array.from({ length: DEPTH - 1 }, (_, i) => `/l${i + 2}`).join("");

function Leaf({ n }: { n: string }): JSX.Element {
  return (
    <main data-testid="page-item" data-n={n}>
      <h1>{n}</h1>
    </main>
  );
}

function BottomLayout(): JSX.Element {
  return (
    <div className="sec">
      <nav>
        <Link to={`${deepPrefix}/a`} data-testid="link-sec-a">
          A
        </Link>
        <Link to={`${deepPrefix}/b`} data-testid="link-sec-b">
          B
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}

function PassLayout(): JSX.Element {
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
    <main data-testid="page-home">
      <h1>Home</h1>
    </main>
  ),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const levels: any[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let parent: any = rootRoute;
for (let k = 1; k <= DEPTH; k++) {
  const p = parent;
  const route = createRoute({
    getParentRoute: () => p,
    path: k === 1 ? "/sec" : `l${k}`,
    component: k === DEPTH ? BottomLayout : PassLayout,
  });
  levels.push(route);
  parent = route;
}
const bottom = levels[levels.length - 1];
const aRoute = createRoute({
  getParentRoute: () => bottom,
  path: "a",
  component: () => <Leaf n="a" />,
});
const bRoute = createRoute({
  getParentRoute: () => bottom,
  path: "b",
  component: () => <Leaf n="b" />,
});
bottom.addChildren([aRoute, bRoute]);
for (let k = 0; k < levels.length - 1; k++) levels[k].addChildren([levels[k + 1]]);

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, levels[0]]),
  history: createBrowserHistory(),
});

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
