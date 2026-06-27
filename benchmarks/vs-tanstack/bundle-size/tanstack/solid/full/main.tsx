import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useParams,
} from "@tanstack/solid-router";
import { render } from "solid-js/web";

const rootRoute = createRootRoute({ component: RootComponent });

const itemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/items/$id",
  loader: ({ params }) => ({ id: params.id }),
  component: ItemsComponent,
});

const detailsRoute = createRoute({
  getParentRoute: () => itemsRoute,
  path: "details",
  component: () => <div>details</div>,
});

function RootComponent() {
  return (
    <>
      <Link
        to="/items/$id"
        params={{ id: "1" }}
        activeProps={{ class: "active" }}
      >
        items
      </Link>
      <Outlet />
    </>
  );
}

function ItemsComponent() {
  const params = useParams({ from: "/items/$id" });
  const navigate = useNavigate();
  const data = itemsRoute.useLoaderData();

  return (
    <div onClick={() => void navigate({ to: "/" })}>
      <Link from={itemsRoute.fullPath} to="./details">
        {`details:${params().id}:${data().id}`}
      </Link>
      <Outlet />
    </div>
  );
}

const router = createRouter({
  history: createMemoryHistory({ initialEntries: ["/"] }),
  routeTree: rootRoute.addChildren([itemsRoute.addChildren([detailsRoute])]),
});

render(
  () => <RouterProvider router={router} />,
  document.querySelector("#root")!,
);
