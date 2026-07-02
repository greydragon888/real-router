// real-router (Vue) wide variant — 1000 flat sibling routes via the segment trie.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouterProvider, useRoute } from "@real-router/vue";
import { createApp, defineComponent, h } from "vue";

import { CatalogItem } from "../../../_shared/pages";
import { WIDE_TARGETS, wideItems } from "../../../_shared/wide-spec";

import type { Route } from "@real-router/core";

const routes: Route[] = [
  { name: "home", path: "/" },
  ...wideItems.map((n) => ({ name: `item${n}`, path: `/catalog/item-${n}` })),
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
      return (
        <>
          <nav>
            {WIDE_TARGETS.map((n) => (
              <Link key={n} routeName={`item${n}`} data-testid={`link-item-${n}`}>
                Item {n}
              </Link>
            ))}
          </nav>
          {name.startsWith("item") ? (
            <CatalogItem n={name.slice(4)} />
          ) : (
            <main data-testid="page-home">
              <h1>Home</h1>
            </main>
          )}
        </>
      );
    };
  },
});

createApp({
  render: () => h(RouterProvider, { router }, { default: () => h(App) }),
}).mount("#root");
