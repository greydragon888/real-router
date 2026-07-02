// @tanstack/vue-router links variant — 100 active-aware <Link> (tanstack toggles
// active data-status on the matching link, recomputed each navigation).
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

import { tabs } from "../../../_shared/links-spec";

const rootRoute = createRootRoute({
  component: defineComponent({
    setup: () => () => (
      <>
        <nav>
          {tabs.map((i) => (
            <Link key={i} to="/tab/$i" params={{ i: String(i) }} data-testid={`link-tab-${i}`}>
              Tab {i}
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

const tabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tab/$i",
  component: defineComponent({
    setup() {
      const params = useParams({ strict: false });
      return () => (
        <main data-testid="page-tab" data-n={String(params.value.i)}>
          Tab {params.value.i}
        </main>
      );
    },
  }),
});

const routeTree = rootRoute.addChildren([homeRoute, tabRoute]);
const router = createRouter({ routeTree });

const App = defineComponent({ setup: () => () => h(RouterProvider, { router }) });

createApp(App).mount("#root");
