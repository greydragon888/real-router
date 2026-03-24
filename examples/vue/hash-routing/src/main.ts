import { createRouter } from "@real-router/core";
import { hashPluginFactory } from "@real-router/hash-plugin";
import { RouterProvider } from "@real-router/vue";
import { createApp, h } from "vue";

import App from "./App.vue";
import { routes } from "./routes";

import "../../../shared/styles.css";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(hashPluginFactory({ hashPrefix: "!" }));

await router.start();

const app = createApp({
  render: () => h(RouterProvider, { router }, { default: () => h(App) }),
});

app.mount("#root");
