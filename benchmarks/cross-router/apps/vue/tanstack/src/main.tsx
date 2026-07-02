// @tanstack/vue-router base app — home/about/user. Full router: route tree
// (createRootRoute + createRoute), <RouterProvider>, Link/Outlet, useParams.
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from "@tanstack/vue-router";
import { createApp, defineComponent, h } from "vue";

import { About, Home, User } from "../../_shared/pages";

const rootRoute = createRootRoute({
  component: defineComponent({
    setup() {
      return () => (
        <>
          <nav>
            <Link to="/" data-testid="link-home">
              Home
            </Link>
            <Link to="/about" data-testid="link-about">
              About
            </Link>
          </nav>
          <Outlet />
        </>
      );
    },
  }),
});

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home });
const aboutRoute = createRoute({ getParentRoute: () => rootRoute, path: "/about", component: About });
const userRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users/$id",
  component: defineComponent({
    setup() {
      const params = useParams({ strict: false });
      return () => {
        const id = String(params.value.id);
        const next = String(Number(id) + 1);
        return (
          <>
            <User id={id} />
            <Link to="/users/$id" params={{ id: next }} data-testid="link-user-next">
              Next
            </Link>
          </>
        );
      };
    },
  }),
});

const routeTree = rootRoute.addChildren([homeRoute, aboutRoute, userRoute]);
const router = createRouter({ routeTree });

const App = defineComponent({ setup: () => () => h(RouterProvider, { router }) });

createApp(App).mount("#root");
