import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { createRouterPlugin } from "@real-router/vue";
import { createApp } from "vue";

import App from "./App.vue";
import { routes } from "./routes";

import "../../../../shared/styles.css";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

const app = createApp(App);

// Vue plugin pattern — no <RouterProvider> needed!
app.use(createRouterPlugin(router));

app.mount("#root");
