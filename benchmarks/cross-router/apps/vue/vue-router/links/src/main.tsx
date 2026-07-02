// vue-router links variant — 100 active-aware <RouterLink> (vue-router applies
// router-link-active on the matching link and recomputes on each navigation).
import { createApp, defineComponent } from "vue";
import {
  RouterLink,
  RouterView,
  createRouter,
  createWebHistory,
  useRoute,
} from "vue-router";

import { tabs } from "../../../_shared/links-spec";

const TabPage = defineComponent({
  setup() {
    const route = useRoute();
    return () => (
      <main data-testid="page-tab" data-n={String(route.params.i)}>
        Tab {route.params.i}
      </main>
    );
  },
});

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: defineComponent({ setup: () => () => <main data-testid="page-home">Home</main> }) },
    { path: "/tab/:i", component: TabPage },
  ],
});

const App = defineComponent({
  setup() {
    return () => (
      <>
        <nav>
          {tabs.map((i) => (
            <RouterLink key={i} to={`/tab/${i}`} data-testid={`link-tab-${i}`}>
              Tab {i}
            </RouterLink>
          ))}
        </nav>
        <RouterView />
      </>
    );
  },
});

createApp(App).use(router).mount("#root");
