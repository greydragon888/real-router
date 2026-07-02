// @tanstack/vue-router param-scaling variant — routes with 1/10/100 path params
// (tanstack uses `$param` syntax).
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

import {
  PARAM_COUNTS,
  paramPattern,
  paramValues,
} from "../../../_shared/param-spec";

const ParamLeaf = defineComponent({
  setup() {
    const params = useParams({ strict: false });
    return () => {
      const count = Object.keys(params.value).filter((k) =>
        /^k\d+$/.test(k),
      ).length;
      return (
        <main data-testid="page-param" data-count={count}>
          {count} params
        </main>
      );
    };
  },
});

const rootRoute = createRootRoute({
  component: defineComponent({
    setup: () => () => (
      <>
        <nav>
          {PARAM_COUNTS.map((n) => (
            <Link
              key={n}
              to={paramPattern(n, "$")}
              params={paramValues(n)}
              data-testid={`link-param-${n}`}
            >
              {n}
            </Link>
          ))}
        </nav>
        <Outlet />
      </>
    ),
  }),
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: defineComponent({ setup: () => () => <main data-testid="page-home">Home</main> }),
});

const paramRoutes = PARAM_COUNTS.map((n) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: paramPattern(n, "$"),
    component: ParamLeaf,
  }),
);

const routeTree = rootRoute.addChildren([homeRoute, ...paramRoutes]);
const router = createRouter({ routeTree });

const App = defineComponent({ setup: () => () => h(RouterProvider, { router }) });

createApp(App).mount("#root");
