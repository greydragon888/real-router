import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const aRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/a",
  component: () => <div data-testid="page-a">A</div>,
});

const bRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/b",
  component: () => <div data-testid="page-b">B</div>,
});

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/a"] }),
    routeTree: rootRoute.addChildren([aRoute, bRoute]),
  });
  const reactRoot = createRoot(container);

  reactRoot.render(<RouterProvider router={router} />);

  return {
    router,
    unmount() {
      reactRoot.unmount();
    },
  };
}
