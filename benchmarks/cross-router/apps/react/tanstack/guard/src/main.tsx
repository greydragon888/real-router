// FEATURE DEMO — blocking guard (TanStack). `useBlocker({ shouldBlockFn,
// withResolver })` blocks leaving while dirty (no native confirm dialog); Save
// clears the flag and navigation is allowed.
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useBlocker,
} from "@tanstack/react-router";
import { useState } from "react";
import { createRoot } from "react-dom/client";

import type { JSX } from "react";

function Editor(): JSX.Element {
  const [dirty, setDirty] = useState(true);
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    withResolver: true,
  });

  return (
    <main data-testid="page-editor">
      <h1>Editor</h1>
      <button
        data-testid="btn-save"
        onClick={() => {
          setDirty(false);
          if (blocker.status === "blocked") blocker.reset();
        }}
      >
        Save
      </button>
      <Link to="/" data-testid="link-home">
        Home
      </Link>
    </main>
  );
}

const rootRoute = createRootRoute({ component: Outlet });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <main data-testid="page-home">Home</main>,
});
const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/editor",
  component: Editor,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, editorRoute]),
  history: createBrowserHistory(),
});

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
