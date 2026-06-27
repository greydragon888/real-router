import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/vue-router";
import * as Vue from "vue";

const rootRoute = createRootRoute({
  component: Vue.defineComponent({
    setup() {
      return () => <Outlet />;
    },
  }),
});

const aRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/a",
  component: Vue.defineComponent({
    setup() {
      return () => <main data-bench-page="a">A</main>;
    },
  }),
});

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/a"] }),
    routeTree: rootRoute.addChildren([aRoute]),
  });

  const component = <RouterProvider router={router} />;
  const app = Vue.createApp({
    render: () => component,
  });
  let didUnmount = false;

  app.mount(container);

  // Full teardown: guard double-unmount and detach history listeners.
  return {
    router,
    unmount() {
      if (didUnmount) {
        return;
      }

      didUnmount = true;
      app.unmount();
      router.history.destroy();
    },
  };
}
