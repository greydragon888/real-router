// real-router (Vue) links variant — 100 active-aware <Link activeClassName>.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouterProvider, useRoute } from "@real-router/vue";
import { createApp, defineComponent, h } from "vue";

import { tabs } from "../../../_shared/links-spec";

import type { Route } from "@real-router/core";

const routes: Route[] = [
  { name: "home", path: "/" },
  ...tabs.map((i) => ({ name: `tab${i}`, path: `/tab/${i}` })),
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

// The route-dependent <main> lives in its own route-subscribed component, so the
// App shell that mounts the N <Link>s does NOT call useRoute() and never
// re-renders on navigation — mirrors vue-router's <RouterView> app, where only
// the matched view re-renders while the N links stay mounted untouched. Without
// this, App's useRoute() re-renders the whole shell every nav, re-creating all N
// <Link> vnodes → O(N) VDOM reconciliation per navigation (the #1483 lag was
// this bench-app asymmetry, not the adapter: rr's active-source is already
// O(1)+O(changed) via createActiveNameSelector).
const TabMain = defineComponent({
  setup() {
    const { route } = useRoute();
    return () => {
      const { name } = route.value;
      const n = name.startsWith("tab") ? name.slice(3) : "";
      return n ? (
        <main data-testid="page-tab" data-n={n}>
          Tab {n}
        </main>
      ) : (
        <main data-testid="page-home">Home</main>
      );
    };
  },
});

const App = defineComponent({
  setup() {
    return () => (
      <>
        <nav>
          {tabs.map((i) => (
            <Link
              key={i}
              routeName={`tab${i}`}
              activeClassName="active"
              data-testid={`link-tab-${i}`}
            >
              Tab {i}
            </Link>
          ))}
        </nav>
        <TabMain />
      </>
    );
  },
});

createApp({
  render: () => h(RouterProvider, { router }, { default: () => h(App) }),
}).mount("#root");
