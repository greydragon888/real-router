import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/core/utils";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrate } from "svelte";

import App from "./App.svelte";
import { lookupUserFromCookies, parseCookieHeader } from "./_known-users";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

declare global {
  // eslint-disable-next-line no-var
  var __SSR_STATE__: { path: string } | undefined;
}

const router = createAppRouter({
  currentUser: lookupUserFromCookies(parseCookieHeader(document.cookie)),
});

router.usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders));

const ssrState = globalThis.__SSR_STATE__;

await (ssrState ? hydrateRouter(router, ssrState) : router.start());

const rootElement = document.querySelector("#root");

if (rootElement) {
  // Svelte 5 — `hydrate(component, options)` is a separate function from
  // `mount(component, options)`. There is no `mount({ hydrate: true })` in
  // Svelte 5 (that's the deprecated Svelte 4 API surface via
  // `asClassComponent` compat shim). Use strictly `hydrate()` for SSR'd
  // markup.
  hydrate(App, { target: rootElement, props: { router } });
}
