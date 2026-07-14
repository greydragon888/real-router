// tanstack link-build variant — mount 1000 <Link>s on demand.
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { createRoot } from "react-dom/client";

import type { JSX } from "react";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const COUNT = _n > 0 ? _n : 1000;

function Home(): JSX.Element {
  const [show, setShow] = useState(false);
  return (
    <>
      <button data-testid="mount-links" onClick={() => setShow(true)}>
        mount
      </button>
      <main data-testid="page-ready">{show ? "shown" : "idle"}</main>
      {show && (
        <nav>
          {Array.from({ length: COUNT }, (_, i) => (
            <Link
              key={i}
              to={`/r${i}`}
              data-testid={i === COUNT - 1 ? "last-link" : undefined}
            >
              r{i}
            </Link>
          ))}
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

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
