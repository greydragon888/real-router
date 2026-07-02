// vue-router table-heap variant — N flat route records (?n=N).
import { createApp, defineComponent } from "vue";
import { RouterView, createRouter, createWebHistory } from "vue-router";

const n = Number(new URLSearchParams(location.search).get("n") ?? "1");

const Ready = defineComponent({
  setup: () => () => (
    <main data-testid="page-ready" data-n={String(n)}>
      ready
    </main>
  ),
});
const Empty = defineComponent({ setup: () => () => null });

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: Ready },
    ...Array.from({ length: n }, (_, i) => ({ path: `/r${i}`, component: Empty })),
  ],
});

const App = defineComponent({ setup: () => () => <RouterView /> });

createApp(App).use(router).mount("#root");
