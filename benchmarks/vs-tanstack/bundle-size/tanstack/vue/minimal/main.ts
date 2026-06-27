import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/vue-router";
import { createApp, defineComponent, h } from "vue";

const rootRoute = createRootRoute({
  component: defineComponent({
    setup() {
      return () => h("div", "hello world");
    },
  }),
});

const router = createRouter({
  history: createMemoryHistory({ initialEntries: ["/"] }),
  routeTree: rootRoute,
});

const App = defineComponent({
  setup() {
    return () => h(RouterProvider, { router });
  },
});

createApp(App).mount("#root");
