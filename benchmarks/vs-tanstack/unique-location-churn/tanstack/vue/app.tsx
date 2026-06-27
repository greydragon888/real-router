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

const ItemComponent = Vue.defineComponent({
  setup() {
    const data = itemsRoute.useLoaderData();

    return () => (
      <main
        data-bench-id={data.value.id}
      >{`${data.value.id}:${data.value.q}`}</main>
    );
  },
});

const itemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/items/$id",
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ params, deps }) => ({ id: params.id, q: deps.q }),
  component: ItemComponent,
});

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/items/0?q="] }),
    routeTree: rootRoute.addChildren([itemsRoute]),
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
