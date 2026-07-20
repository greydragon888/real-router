import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/ssr-utils";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrate } from "svelte";

import { lookupUserFromCookies, parseCookieHeader } from "./_known-users";
import App from "./App.svelte";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

import type {
  DataLoaderFactoryMap,
  DataLoaderFnFactory,
} from "@real-router/ssr-data-plugin";

declare global {
  var __SSR_STATE__: { path: string } | undefined;

  var __LOADER_CALLS__: Record<string, number> | undefined;
}

const router = createAppRouter({
  currentUser: lookupUserFromCookies(parseCookieHeader(document.cookie)),
});

const loaderCalls: Record<string, number> = {};

globalThis.__LOADER_CALLS__ = loaderCalls;

const instrumentedLoaders: DataLoaderFactoryMap = Object.fromEntries(
  Object.entries(loaders).map(([name, raw]) => {
    // Per-route SSR mode (#597): non-function entries (`{ ssr: false }`,
    // `{ ssr: "data-only", loader: … }`) pass through as-is. Only the
    // function form needs the loader-call counter wrap.
    if (typeof raw !== "function") return [name, raw];

    const factory = raw as DataLoaderFnFactory;

    return [
      name,
      (r, getDep) => {
        const loader = factory(r, getDep);

        return (params) => {
          loaderCalls[name] = (loaderCalls[name] ?? 0) + 1;

          return loader(params);
        };
      },
    ];
  }),
) as DataLoaderFactoryMap;

router.usePlugin(
  browserPluginFactory(),
  ssrDataPluginFactory(instrumentedLoaders),
);

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
