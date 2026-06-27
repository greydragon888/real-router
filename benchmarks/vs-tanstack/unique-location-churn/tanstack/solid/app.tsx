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

  return <main data-bench-id={data().id}>{`${data().id}:${data().q}`}</main>;
}

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/items/0?q="] }),
    routeTree: rootRoute.addChildren([itemsRoute]),
  });

  const unmount = render(() => <RouterProvider router={router} />, container);

  return {
    router,
    unmount,
  };
}
