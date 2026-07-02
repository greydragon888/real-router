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

const App = defineComponent({
  setup() {
    const { route } = useRoute();
    return () => {
      const { name } = route.value;
      const n = name.startsWith("tab") ? name.slice(3) : "";
      return (
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
          {n ? (
            <main data-testid="page-tab" data-n={n}>
              Tab {n}
            </main>
          ) : (
            <main data-testid="page-home">Home</main>
          )}
        </>
      );
    };
  },
});

createApp({
  render: () => h(RouterProvider, { router }, { default: () => h(App) }),
}).mount("#root");
