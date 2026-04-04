import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/vue";
import { createApp, h } from "vue";

import App from "./App.vue";
import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";
import { routes } from "./routes";

import "../../../shared/styles.css";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory(), lifecyclePluginFactory());

await router.start();

const app = createApp({
  render: () => h(RouterProvider, { router }, { default: () => h(App) }),
});

app.mount("#root");
