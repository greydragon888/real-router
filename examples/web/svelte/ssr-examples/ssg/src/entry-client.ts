import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/ssr-utils";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrate, mount } from "svelte";

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

const router = createAppRouter();

const loaderCalls: Record<string, number> = {};

globalThis.__LOADER_CALLS__ = loaderCalls;

const instrumentedLoaders: DataLoaderFactoryMap = Object.fromEntries(
  (Object.entries(loaders) as [string, DataLoaderFnFactory][]).map(
    ([name, factory]) => [
      name,
      (r, getDep) => {
        const loader = factory(r, getDep);

        return (params) => {
          loaderCalls[name] = (loaderCalls[name] ?? 0) + 1;

          return loader(params);
        };
      },
    ],
  ),
) as DataLoaderFactoryMap;

router.usePlugin(
  browserPluginFactory(),
  ssrDataPluginFactory(instrumentedLoaders),
);

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
