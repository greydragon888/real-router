// real-router (Vue) table-heap variant — build N routes (?n=N); harness measures
// retained JS heap (segment trie precompiled at registration).
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { RouterProvider, useRoute } from "@real-router/vue";
import { createApp, defineComponent, h } from "vue";

import type { Route } from "@real-router/core";

const n = Number(new URLSearchParams(location.search).get("n") ?? "1");

const routes: Route[] = [
  { name: "home", path: "/" },
  ...Array.from({ length: n }, (_, i) => ({ name: `r${i}`, path: `/r${i}` })),
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
    return () => (
      <main data-testid="page-ready" data-n={String(n)}>
        {route.value.name}
      </main>
    );
  },
});

createApp({
  render: () => h(RouterProvider, { router }, { default: () => h(App) }),
}).mount("#root");
