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

function ItemComponent() {
  const data = itemsRoute.useLoaderData();

  return <main data-bench-id={data.id}>{`${data.id}:${data.q}`}</main>;
}

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/items/0?q="] }),
    routeTree: rootRoute.addChildren([itemsRoute]),
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
