import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/vue";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { createApp, createSSRApp, h } from "vue";

import App from "./App.vue";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

declare global {
  // eslint-disable-next-line no-var
  var __SSR_STATE__: { path: string } | undefined;
  // eslint-disable-next-line no-var -- e2e instrumentation (#596)
  var __LOADER_CALLS__: Record<string, number> | undefined;
}

const router = createAppRouter();

const loaderCalls: Record<string, number> = {};

globalThis.__LOADER_CALLS__ = loaderCalls;

const instrumentedLoaders: DataLoaderFactoryMap = Object.fromEntries(
  Object.entries(loaders).map(([name, factory]) => [
    name,
    (r, getDep) => {
      const loader = factory(r, getDep);

      return (params) => {
        loaderCalls[name] = (loaderCalls[name] ?? 0) + 1;

        return loader(params);
      };
    },
  ]),
) as DataLoaderFactoryMap;

router.usePlugin(
  browserPluginFactory(),
  ssrDataPluginFactory(instrumentedLoaders),
);

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
