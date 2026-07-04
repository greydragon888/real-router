// @tanstack/vue-router search-param-scaling variant — routes with N query params
// (/sN?k1=v1&...&kN=vN). `validateSearch: (s) => s` keeps arbitrary query; the leaf
// reads EVERY value via `useSearch({ strict: false })` (readSearch → checksum).
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useSearch,
} from "@tanstack/vue-router";
import { createApp, defineComponent, h } from "vue";

import {
  SEARCH_COUNTS,
  searchValues,
  readSearch,
} from "../../../_shared/search-param-spec";

const SearchLeaf = defineComponent({
  setup() {
    const search = useSearch({ strict: false });
    return () => {
      const { count, checksum } = readSearch(Object.entries(search.value));
      return (
        <main data-testid="page-search" data-count={count}>
          {count} search · Σ{checksum}
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
          {SEARCH_COUNTS.map((n) => (
            <Link
              key={n}
              to={`/s${n}`}
              search={searchValues(n)}
              data-testid={`link-search-${n}`}
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
  component: defineComponent({
    setup: () => () => <main data-testid="page-home">Home</main>,
  }),
});

const searchRoutes = SEARCH_COUNTS.map((n) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: `/s${n}`,
    validateSearch: (search: Record<string, unknown>) => search,
    component: SearchLeaf,
  }),
);

const routeTree = rootRoute.addChildren([homeRoute, ...searchRoutes]);
const router = createRouter({ routeTree });

const App = defineComponent({ setup: () => () => h(RouterProvider, { router }) });

createApp(App).mount("#root");
