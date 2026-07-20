import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/ssr-utils";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrate } from "svelte";

import App from "./App.svelte";
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
  hydrate(App, { target: rootElement, props: { router } });
}
