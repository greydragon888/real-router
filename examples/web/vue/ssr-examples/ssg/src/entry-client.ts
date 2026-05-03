import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/vue";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { createApp, createSSRApp, h } from "vue";

import App from "./App.vue";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

declare global {
  // eslint-disable-next-line no-var
  var __SSR_STATE__: { path: string } | undefined;
}

const router = createAppRouter();

router.usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders));

const ssrState = globalThis.__SSR_STATE__;

await (ssrState ? hydrateRouter(router, ssrState) : router.start());

const rootElement = document.querySelector("#root");

if (rootElement) {
  // Detect SSG content vs dev mode (client-only): hydrate when server-rendered
  // children are present, otherwise mount fresh.
  const factory = rootElement.firstElementChild ? createSSRApp : createApp;

  const app = factory({
    render: () => h(RouterProvider, { router }, { default: () => h(App) }),
  });

  app.mount(rootElement);
}
