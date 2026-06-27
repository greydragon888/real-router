import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

const RECORD_COUNT = 200;

function createPayload(id: string) {
  return Array.from({ length: RECORD_COUNT }, (_, index) => ({
    id,
    index,
    value: `record-${id}-${index}`,
  }));
}

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <main data-bench-page="shell">shell</main>,
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

function PageComponent() {
  const data = pageRoute.useLoaderData();

  return (
    <main data-bench-page="page" data-bench-id={data.id}>
      {`page:${data.id}:${data.records.length}`}
    </main>
  );
}

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute.addChildren([shellRoute, pageRoute]),
    defaultGcTime: 0,
  });
  const reactRoot = createRoot(container);

  reactRoot.render(<RouterProvider router={router} />);

  return {
    router,
    unmount() {
      reactRoot.unmount();
      router.history.destroy();
    },
  };
}
