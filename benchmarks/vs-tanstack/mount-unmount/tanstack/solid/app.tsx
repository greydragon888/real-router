import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/solid-router";
import { render } from "solid-js/web";

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
  const dispose = render(() => <RouterProvider router={router} />, container);
  let didUnmount = false;

  // Full teardown: guard double-unmount and detach history listeners.
  return {
    router,
    unmount() {
      if (didUnmount) {
        return;
      }

      didUnmount = true;
      dispose();
      router.history.destroy();
    },
  };
}
