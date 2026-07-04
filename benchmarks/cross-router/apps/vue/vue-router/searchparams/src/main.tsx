// vue-router search-param-scaling variant — routes with N query params
// (/sN?k1=v1&...&kN=vN). vue-router exposes query LAZILY via the reactive
// `route.query`. The leaf reads EVERY value (readSearch → checksum) so the reactive
// query is actually materialized — apples-to-apples with real-router's eager params.
import { createApp, defineComponent } from "vue";
import {
  RouterLink,
  RouterView,
  createRouter,
  createWebHistory,
  useRoute,
} from "vue-router";

import {
  SEARCH_COUNTS,
  searchQuery,
  readSearch,
} from "../../../_shared/search-param-spec";

const SearchLeaf = defineComponent({
  setup() {
    const route = useRoute();
    return () => {
      const { count, checksum } = readSearch(Object.entries(route.query));
      return (
        <main data-testid="page-search" data-count={count}>
          {count} search · Σ{checksum}
        </main>
      );
    };
  },
});

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: defineComponent({
        setup: () => () => <main data-testid="page-home">Home</main>,
      }),
    },
    ...SEARCH_COUNTS.map((n) => ({ path: `/s${n}`, component: SearchLeaf })),
  ],
});

const App = defineComponent({
  setup() {
    return () => (
      <>
        <nav>
          {SEARCH_COUNTS.map((n) => (
            <RouterLink
              key={n}
              to={`/s${n}?${searchQuery(n)}`}
              data-testid={`link-search-${n}`}
            >
              {n}
            </RouterLink>
          ))}
        </nav>
        <RouterView />
      </>
    );
  },
});

createApp(App).use(router).mount("#root");
