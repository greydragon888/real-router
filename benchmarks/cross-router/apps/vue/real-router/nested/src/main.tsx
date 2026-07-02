// real-router (Vue) nested variant — shared SectionLayout (nodeName="sec") with
// sibling leaves a/b. Switching a↔b keeps SectionLayout mounted.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider } from "@real-router/vue";
import { createApp, defineComponent, h } from "vue";

import type { Route } from "@real-router/core";

const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "sec",
    path: "/sec",
    children: [
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ],
  },
];

const router = createRouter(routes, {
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

const SectionLayout = defineComponent({
  setup() {
    return () => (
      <div class="sec">
        <nav>
          <Link routeName="sec.a" data-testid="link-sec-a">
            A
          </Link>
          <Link routeName="sec.b" data-testid="link-sec-b">
            B
          </Link>
        </nav>
        <RouteView nodeName="sec">
          <RouteView.Match segment="a">
            <Leaf n="a" />
          </RouteView.Match>
          <RouteView.Match segment="b">
            <Leaf n="b" />
          </RouteView.Match>
        </RouteView>
      </div>
    );
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
          <SectionLayout />
        </RouteView.Match>
      </RouteView>
    );
  },
});

createApp({
  render: () => h(RouterProvider, { router }, { default: () => h(App) }),
}).mount("#root");
