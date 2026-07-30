// real-router (Vue) search-param-scaling variant — routes with N query params
// (/sN?k1=v1&...&kN=vN). Query declared in the path pattern (`?k1&...`), lives in
// `route.value.search`, parsed eagerly by the matcher. The leaf reads EVERY value.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider, useRoute } from "@real-router/vue";
import { createApp, defineComponent, h } from "vue";

import {
  SEARCH_COUNTS,
  searchDecl,
  searchValues,
  readSearch,
} from "../../../_shared/search-param-spec";

import type { Route } from "@real-router/core";

const routes: Route[] = [
  { name: "home", path: "/" },
  ...SEARCH_COUNTS.map((n) => ({ name: `s${n}`, path: `/s${n}${searchDecl(n)}` })),
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

const SearchLeaf = defineComponent({
  setup() {
    const { route } = useRoute();
    return () => {
      const { count, checksum } = readSearch(Object.entries(route.value.search));
      return (
        <main data-testid="page-search" data-count={count}>
          {count} search · Σ{checksum}
        </main>
      );
    };
  },
});

const App = defineComponent({
  setup() {
    return () => (
      <>
        <nav>
          {SEARCH_COUNTS.map((n) => (
            <Link
              key={n}
              routeName={`s${n}`}
              routeSearch={searchValues(n)}
              data-testid={`link-search-${n}`}
            >
              {n}
            </Link>
          ))}
        </nav>
        <RouteView nodeName="">
          <RouteView.Match segment="home">
            <main data-testid="page-home">Home</main>
          </RouteView.Match>
          {SEARCH_COUNTS.map((n) => (
            <RouteView.Match key={n} segment={`s${n}`}>
              <SearchLeaf />
            </RouteView.Match>
          ))}
        </RouteView>
      </>
    );
  },
});

createApp({
  render: () => h(RouterProvider, { router }, { default: () => h(App) }),
}).mount("#root");
