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
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

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
        activeProps={{ className: "active" }}
      >
        items
      </Link>
      <Outlet />
    </>
  );
}

function ItemsComponent() {
  const { id } = useParams({ from: "/items/$id" });
  const navigate = useNavigate();
  const data = itemsRoute.useLoaderData();

  return (
    <div onClick={() => void navigate({ to: "/" })}>
      <Link from={itemsRoute.fullPath} to="./details">
        {`details:${id}:${data.id}`}
      </Link>
      <Outlet />
    </div>
  );
}

const router = createRouter({
  history: createMemoryHistory({ initialEntries: ["/"] }),
  routeTree: rootRoute.addChildren([itemsRoute.addChildren([detailsRoute])]),
});

createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
