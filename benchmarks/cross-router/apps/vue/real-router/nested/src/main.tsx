// real-router (Vue) nested variant — shared layout chain of DEPTH D (from `?n=`,
// default 1) with sibling leaves a/b at the bottom. Switching a↔b keeps the whole
// D-deep chain mounted; only the inner Match swaps — the curve tests parent reuse.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider } from "@real-router/vue";
import { createApp, defineComponent, h } from "vue";

import type { Route } from "@real-router/core";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const DEPTH = _n > 0 ? _n : 1;

function buildRoutes(): Route[] {
  const ab: Route[] = [
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ];
  let node: Route = { name: `l${DEPTH}`, path: `/l${DEPTH}`, children: ab };
  for (let k = DEPTH - 1; k >= 2; k--) {
    node = { name: `l${k}`, path: `/l${k}`, children: [node] };
  }
  const sec: Route =
    DEPTH === 1
      ? { name: "sec", path: "/sec", children: ab }
      : { name: "sec", path: "/sec", children: [node] };
  return [{ name: "home", path: "/" }, sec];
}

const router = createRouter(buildRoutes(), {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

const Leaf = defineComponent({
  props: { n: { type: String, required: true } },
  setup(props) {
    return () => (
      <main data-testid="page-item" data-n={props.n}>
        <h1>{props.n}</h1>
      </main>
    );
  },
});

const Chain = defineComponent({
  props: {
    level: { type: Number, required: true },
    dotted: { type: String, required: true },
  },
  setup(props) {
    return () => {
      if (props.level === DEPTH) {
        return (
          <div class="sec">
            <nav>
              <Link routeName={`${props.dotted}.a`} data-testid="link-sec-a">
                A
              </Link>
              <Link routeName={`${props.dotted}.b`} data-testid="link-sec-b">
                B
              </Link>
            </nav>
            <RouteView nodeName={props.dotted}>
              <RouteView.Match segment="a">
                <Leaf n="a" />
              </RouteView.Match>
              <RouteView.Match segment="b">
                <Leaf n="b" />
              </RouteView.Match>
            </RouteView>
          </div>
        );
      }
      const childSeg = `l${props.level + 1}`;
      return (
        <div class="lvl">
          <RouteView nodeName={props.dotted}>
            <RouteView.Match segment={childSeg}>
              <Chain level={props.level + 1} dotted={`${props.dotted}.${childSeg}`} />
            </RouteView.Match>
          </RouteView>
        </div>
      );
    };
  },
});

const App = defineComponent({
  setup() {
    return () => (
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <main data-testid="page-home">
            <h1>Home</h1>
          </main>
        </RouteView.Match>
        <RouteView.Match segment="sec">
          <Chain level={1} dotted="sec" />
        </RouteView.Match>
      </RouteView>
    );
  },
});

createApp({
  render: () => h(RouterProvider, { router }, { default: () => h(App) }),
}).mount("#root");
