// real-router (Vue) param-scaling variant — routes with 1/10/100 path params.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider, useRoute } from "@real-router/vue";
import { createApp, defineComponent, h } from "vue";

import {
  PARAM_COUNTS,
  paramPattern,
  paramValues,
} from "../../../_shared/param-spec";

import type { Route } from "@real-router/core";

const routes: Route[] = [
  { name: "home", path: "/" },
  ...PARAM_COUNTS.map((n) => ({ name: `p${n}`, path: paramPattern(n, ":") })),
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

const ParamLeaf = defineComponent({
  setup() {
    const { route } = useRoute();
    return () => {
      const count = Object.keys(route.value.params).filter((k) =>
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

const App = defineComponent({
  setup() {
    return () => (
      <>
        <nav>
          {PARAM_COUNTS.map((n) => (
            <Link
              key={n}
              routeName={`p${n}`}
              routeParams={paramValues(n)}
              data-testid={`link-param-${n}`}
            >
              {n}
            </Link>
          ))}
        </nav>
        <RouteView nodeName="">
          <RouteView.Match segment="home">
            <main data-testid="page-home">Home</main>
          </RouteView.Match>
          {PARAM_COUNTS.map((n) => (
            <RouteView.Match key={n} segment={`p${n}`}>
              <ParamLeaf />
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
