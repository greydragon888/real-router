import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/core/utils";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrate, mount } from "svelte";

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
  // Svelte 5 — `hydrate` and `mount` are SEPARATE functions. There is NO
  // `mount({ hydrate: true })` option (that was Svelte 4 compat via
  // `asClassComponent`). Branch explicitly: hydrate when SSG content is
  // present (firstElementChild != null in pre-rendered HTML), mount fresh
  // otherwise (vite dev mode, no SSG).
  if (rootElement.firstElementChild) {
    hydrate(App, { target: rootElement, props: { router } });
  } else {
    mount(App, { target: rootElement, props: { router } });
  }
}
