import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/solid-router";
import { For } from "solid-js";
import { render } from "solid-js/web";

import { NAV } from "../../_shared/nav-meta";
import { About, Home, User } from "../../_shared/pages";

import type { JSX } from "solid-js";

function Root(): JSX.Element {
  return (
    <>
      <nav>
        <For each={NAV}>
          {(n) => (
            <Link to={n.path} data-testid={n.testid}>
              {n.label}
            </Link>
          )}
        </For>
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

function UserRoute(): JSX.Element {
  const params = userRoute.useParams();
  return (
    <>
      <User id={params().id} />
      <Link
        to="/users/$id"
        params={{ id: String(Number(params().id) + 1) }}
        data-testid="link-user-next"
      >
        Next
      </Link>
    </>
  );
}
const userRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users/$id",
  component: UserRoute,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, aboutRoute, userRoute]),
  history: createBrowserHistory(),
});

const root = document.querySelector("#root");
if (root) {
  render(() => <RouterProvider router={router} />, root);
}
