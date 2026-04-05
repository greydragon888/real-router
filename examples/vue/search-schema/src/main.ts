import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { searchSchemaPlugin } from "@real-router/search-schema-plugin";
import { RouterProvider } from "@real-router/vue";
import { createApp, h } from "vue";

import App from "./App.vue";
import { routes } from "./routes";

import "../../../shared/styles.css";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
  queryParams: { numberFormat: "auto" },
});

router.usePlugin(
  browserPluginFactory(),
  searchSchemaPlugin({ mode: "development" }),
);

await router.start();

const app = createApp({
  render: () => h(RouterProvider, { router }, { default: () => h(App) }),
});

app.mount("#root");
