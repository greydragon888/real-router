import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/solid-router";
import { render } from "solid-js/web";

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

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <main data-bench-page="shell">shell</main>,
});

const fastRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/fast/$id",
  loader: ({ params }) => ({ id: params.id }),
  component: FastComponent,
});

function FastComponent() {
  const data = fastRoute.useLoaderData();

  return (
    <main
      data-bench-page="fast"
      data-bench-id={data().id}
    >{`fast:${data().id}`}</main>
  );
}

const slowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/slow/$id",
  loader: ({ params }) => getSlowDeferred(params.id).promise,
  component: () => <main data-bench-page="slow">slow</main>,
});

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute.addChildren([shellRoute, fastRoute, slowRoute]),
  });
  const dispose = render(() => <RouterProvider router={router} />, container);

  return {
    router,
    unmount() {
      dispose();
      router.history.destroy();
    },
  };
}
