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
  component: () => <main data-bench-page="a">A</main>,
});

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/a"] }),
    routeTree: rootRoute.addChildren([aRoute]),
  });
  const reactRoot = createRoot(container);
  let didUnmount = false;

  reactRoot.render(<RouterProvider router={router} />);

  // Full teardown: guard double-unmount and detach history listeners.
  return {
    router,
    unmount() {
      if (didUnmount) {
        return;
      }

      didUnmount = true;
      reactRoot.unmount();
      router.history.destroy();
    },
  };
}
