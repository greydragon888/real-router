// vue-router param-scaling variant — routes with 1/10/100 path params.
import { createApp, defineComponent } from "vue";
import {
  RouterLink,
  RouterView,
  createRouter,
  createWebHistory,
  useRoute,
} from "vue-router";

import { PARAM_COUNTS, paramPath, paramPattern } from "../../../_shared/param-spec";

const ParamLeaf = defineComponent({
  setup() {
    const route = useRoute();
    return () => {
      const count = Object.keys(route.params).filter((k) =>
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

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: defineComponent({ setup: () => () => <main data-testid="page-home">Home</main> }),
    },
    ...PARAM_COUNTS.map((n) => ({ path: paramPattern(n, ":"), component: ParamLeaf })),
  ],
});

const App = defineComponent({
  setup() {
    return () => (
      <>
        <nav>
          {PARAM_COUNTS.map((n) => (
            <RouterLink key={n} to={paramPath(n)} data-testid={`link-param-${n}`}>
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
