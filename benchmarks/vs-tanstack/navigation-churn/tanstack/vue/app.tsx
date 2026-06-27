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
      return () => <div data-testid="page-a">A</div>;
    },
  }),
});

const bRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/b",
  component: Vue.defineComponent({
    setup() {
      return () => <div data-testid="page-b">B</div>;
    },
  }),
});

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/a"] }),
    routeTree: rootRoute.addChildren([aRoute, bRoute]),
  });

  const component = <RouterProvider router={router} />;
  const app = Vue.createApp({
    render: () => component,
  });

  app.mount(container);

  return {
    router,
    unmount() {
      app.unmount();
    },
  };
}
