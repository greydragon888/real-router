import { RouterProvider } from "@real-router/vue";
import { createApp, h } from "vue";

import App from "./App.vue";
import { router } from "./router";

import "../../../../shared/styles.css";

await router.start();

const app = createApp({
  render: () =>
    h(
      RouterProvider,
      { router, announceNavigation: true },
      { default: () => h(App) },
    ),
});

app.mount("#root");
