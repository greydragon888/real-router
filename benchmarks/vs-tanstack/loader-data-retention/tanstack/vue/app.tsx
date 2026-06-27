import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/vue-router";
import * as Vue from "vue";

const RECORD_COUNT = 200;

function createPayload(id: string) {
  return Array.from({ length: RECORD_COUNT }, (_, index) => ({
    id,
    index,
    value: `record-${id}-${index}`,
  }));
}

const rootRoute = createRootRoute({
  component: Vue.defineComponent({
    setup() {
      return () => <Outlet />;
    },
  }),
});

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Vue.defineComponent({
    setup() {
      return () => <main data-bench-page="shell">shell</main>;
    },
  }),
});

const PageComponent = Vue.defineComponent({
  setup() {
    const data = pageRoute.useLoaderData();

    return () => (
      <main data-bench-page="page" data-bench-id={data.value.id}>
        {`page:${data.value.id}:${data.value.records.length}`}
      </main>
    );
  },
});

const pageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/page/$id",
  loader: ({ params }) => ({
    id: params.id,
    records: createPayload(params.id),
  }),
  gcTime: 0,
  staleTime: 0,
  component: PageComponent,
});

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute.addChildren([shellRoute, pageRoute]),
    defaultGcTime: 0,
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
      router.history.destroy();
    },
  };
}
