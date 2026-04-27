import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/vue";
import { createApp, h } from "vue";

import App from "./App.vue";
import { routes } from "./routes";
import { installViewTransitionPolicy } from "./vt-policy";

import "../../../../../shared/styles.css";
import "./styles/transitions.css";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

installViewTransitionPolicy(router);

await router.start();

const app = createApp({
  render: () =>
    h(
      RouterProvider,
      { router, viewTransitions: true },
      { default: () => h(App) },
    ),
});

app.mount("#root");
