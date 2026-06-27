import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/vue-router";
import * as Vue from "vue";

interface SlowDeferred {
  promise: Promise<{ id: string }>;
  resolve: () => void;
}

const slowDeferreds = new Map<string, SlowDeferred>();

function getSlowDeferred(id: string) {
  const existing = slowDeferreds.get(id);

  if (existing) {
    return existing;
  }

  const { promise, resolve: resolveFn } = Promise.withResolvers<{
    id: string;
  }>();
  const deferred: SlowDeferred = {
    promise,
    resolve() {
      slowDeferreds.delete(id);
      resolveFn({ id });
    },
  };

  slowDeferreds.set(id, deferred);

  return deferred;
}

export const slowLoaderControls = {
  has: (id: string) => slowDeferreds.has(id),
  resolve(id: string) {
    slowDeferreds.get(id)?.resolve();
  },
  resolveAll() {
    for (const deferred of slowDeferreds.values()) {
      deferred.resolve();
    }
  },
};

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

const FastComponent = Vue.defineComponent({
  setup() {
    const data = fastRoute.useLoaderData();

    return () => (
      <main
        data-bench-page="fast"
        data-bench-id={data.value.id}
      >{`fast:${data.value.id}`}</main>
    );
  },
});

const fastRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/fast/$id",
  loader: ({ params }) => ({ id: params.id }),
  component: FastComponent,
});

const slowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/slow/$id",
  loader: ({ params }) => getSlowDeferred(params.id).promise,
  component: Vue.defineComponent({
    setup() {
      return () => <main data-bench-page="slow">slow</main>;
    },
  }),
});

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute.addChildren([shellRoute, fastRoute, slowRoute]),
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
