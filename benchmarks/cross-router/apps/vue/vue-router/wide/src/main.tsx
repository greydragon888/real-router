// vue-router wide variant — 1000 flat route records (vue-router's ranked matcher).
import { createApp, defineComponent } from "vue";
import {
  RouterLink,
  RouterView,
  createRouter,
  createWebHistory,
} from "vue-router";

import { CatalogItem } from "../../../_shared/pages";
import { WIDE_TARGETS, wideItems } from "../../../_shared/wide-spec";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: defineComponent({
        setup: () => () => (
          <main data-testid="page-home">
            <h1>Home</h1>
          </main>
        ),
      }),
    },
    ...wideItems.map((n) => ({
      path: `/catalog/item-${n}`,
      component: defineComponent({ setup: () => () => <CatalogItem n={String(n)} /> }),
    })),
  ],
});

const App = defineComponent({
  setup() {
    return () => (
      <>
        <nav>
          {WIDE_TARGETS.map((n) => (
            <RouterLink key={n} to={`/catalog/item-${n}`} data-testid={`link-item-${n}`}>
              Item {n}
            </RouterLink>
          ))}
        </nav>
        <RouterView />
      </>
    );
  },
});

createApp(App).use(router).mount("#root");
