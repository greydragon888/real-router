// real-router (Vue) deep variant — nested route tree to depth 90, recursive
// nested <RouteView>: Self = leaf, Match segment = go deeper.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider } from "@real-router/vue";
import { createApp, defineComponent, h } from "vue";

import { CatalogItem } from "../../../_shared/pages";
import { DEEP_DEPTH, DEEP_TARGETS, deepName } from "../../../_shared/deep-spec";

import type { Route } from "@real-router/core";

function buildRoute(k: number): Route {
  return {
    name: `l${k}`,
    path: `/l${k}`,
    children: k < DEEP_DEPTH ? [buildRoute(k + 1)] : [],
  };
}

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "deep", path: "/deep", children: [buildRoute(1)] },
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

const Level = defineComponent({
  name: "Level",
  props: {
    k: { type: Number, required: true },
    nodeName: { type: String, required: true },
  },
  setup(props) {
    return () => (
      <RouteView nodeName={props.nodeName}>
        <RouteView.Self>
          <CatalogItem n={String(props.k)} />
        </RouteView.Self>
        {props.k < DEEP_DEPTH ? (
          <RouteView.Match segment={`l${props.k + 1}`}>
            <Level k={props.k + 1} nodeName={`${props.nodeName}.l${props.k + 1}`} />
          </RouteView.Match>
        ) : null}
      </RouteView>
    );
  },
});

const App = defineComponent({
  setup() {
    return () => (
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <nav>
            {DEEP_TARGETS.map((d) => (
              <Link key={d} routeName={deepName(d)} data-testid={`link-deep-${d}`}>
                Depth {d}
              </Link>
            ))}
          </nav>
        </RouteView.Match>
        <RouteView.Match segment="deep">
          <RouteView nodeName="deep">
            <RouteView.Match segment="l1">
              <Level k={1} nodeName="deep.l1" />
            </RouteView.Match>
          </RouteView>
        </RouteView.Match>
      </RouteView>
    );
  },
});

createApp({
  render: () => h(RouterProvider, { router }, { default: () => h(App) }),
}).mount("#root");
