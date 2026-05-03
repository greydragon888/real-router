import { hydrateRouter } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/vue";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { createSSRApp, h } from "vue";

import App from "./App.vue";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

declare global {
  // eslint-disable-next-line no-var
  var __SSR_STATE__: { path: string } | undefined;
}

const router = createAppRouter();

router.usePlugin(ssrDataPluginFactory(loaders));

const ssrState = globalThis.__SSR_STATE__;

if (!ssrState) {
  throw new Error("Missing __SSR_STATE__ — server did not render this page");
}

await hydrateRouter(router, ssrState);

const app = createSSRApp({
  render: () => h(RouterProvider, { router }, { default: () => h(App) }),
});

app.mount("#root");
