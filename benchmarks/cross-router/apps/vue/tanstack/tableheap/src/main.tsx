// @tanstack/vue-router table-heap variant — N flat child routes (?n=N).
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/vue-router";
import { createApp, defineComponent, h } from "vue";

const n = Number(new URLSearchParams(location.search).get("n") ?? "1");

const rootRoute = createRootRoute({
  component: defineComponent({ setup: () => () => h(Outlet) }),
});

const readyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: defineComponent({
    setup: () => () => (
      <main data-testid="page-ready" data-n={String(n)}>
        ready
      </main>
    ),
  }),
});

const rRoutes = Array.from({ length: n }, (_, i) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: `/r${i}`,
    component: defineComponent({ setup: () => () => null }),
  }),
);

const routeTree = rootRoute.addChildren([readyRoute, ...rRoutes]);
const router = createRouter({ routeTree });

const App = defineComponent({ setup: () => () => h(RouterProvider, { router }) });

createApp(App).mount("#root");
