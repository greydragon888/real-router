// @tanstack/vue-router wide variant — 1000 flat child routes.
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/vue-router";
import { createApp, defineComponent, h } from "vue";

import { CatalogItem } from "../../../_shared/pages";
import { WIDE_TARGETS, wideItems } from "../../../_shared/wide-spec";

const rootRoute = createRootRoute({
  component: defineComponent({
    setup: () => () => (
      <>
        <nav>
          {WIDE_TARGETS.map((n) => (
            <Link key={n} to={`/catalog/item-${n}`} data-testid={`link-item-${n}`}>
              Item {n}
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
  component: defineComponent({
    setup: () => () => (
      <main data-testid="page-home">
        <h1>Home</h1>
      </main>
    ),
  }),
});

const itemRoutes = wideItems.map((n) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: `/catalog/item-${n}`,
    component: defineComponent({ setup: () => () => <CatalogItem n={String(n)} /> }),
  }),
);

const routeTree = rootRoute.addChildren([homeRoute, ...itemRoutes]);
const router = createRouter({ routeTree });

const App = defineComponent({ setup: () => () => h(RouterProvider, { router }) });

createApp(App).mount("#root");
