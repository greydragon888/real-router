import { browserPluginFactory } from "@real-router/browser-plugin";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrateRouter } from "@real-router/ssr-utils";
import { RouterProvider } from "@real-router/vue";
import { createApp, createSSRApp, h } from "vue";

import App from "./App.vue";
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

/**
 * The e2e counter lives on the global object; assigning through a typed
 * reference satisfies `unicorn/no-global-object-property-assignment` without
 * changing what the page exposes.
 */
const instrumentationHost = globalThis;

const router = createAppRouter();

const loaderCalls: Record<string, number> = {};

instrumentationHost.__LOADER_CALLS__ = loaderCalls;

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
);

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
