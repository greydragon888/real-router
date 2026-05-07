import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/core/utils";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { RouterProvider } from "@real-router/vue";
import { createSSRApp, h } from "vue";

import { lookupUserFromCookies, parseCookieHeader } from "./_known-users";
import App from "./App.vue";
import { trackView } from "./directives/track-view";
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

const app = createSSRApp({
  render: () => h(RouterProvider, { router }, { default: () => h(App) }),
});

// Vue custom directive — body runs ONLY on the client (SSR pipeline
// skips directive lifecycle hooks). Demonstrates Vue's directive
// surface area: mounted/updated/unmounted hooks with reactive
// binding. See src/directives/track-view.ts.
app.directive("track-view", trackView);

app.mount("#root");
