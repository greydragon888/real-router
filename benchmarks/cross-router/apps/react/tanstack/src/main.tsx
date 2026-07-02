// TanStack Router — code-based route tree (createRootRoute / createRoute /
// addChildren / createRouter). Real browser history (not memory).
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

import { NAV } from "../../_shared/nav-meta";
import { About, Home, User } from "../../_shared/pages";

function Root() {
  return (
    <>
      <nav>
        {NAV.map((n) => (
          <Link key={n.path} to={n.path} data-testid={n.testid}>
            {n.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </>
  );
}

const rootRoute = createRootRoute({ component: Root });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
});
const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: About,
});
const userRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users/$id",
  component: UserRoute,
});

function UserRoute() {
  const { id } = userRoute.useParams();
  const next = String(Number(id) + 1);

  return (
    <>
      <User id={id} />
      <Link to="/users/$id" params={{ id: next }} data-testid="link-user-next">
        Next
      </Link>
    </>
  );
}

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, aboutRoute, userRoute]),
  history: createBrowserHistory(),
});

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
