import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/ssr-utils";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { RouterProvider } from "@real-router/vue";
import {
  HttpStatusProvider,
  createHttpStatusSink,
} from "@real-router/vue/ssr";
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

// Mount <HttpStatusProvider> on the client too so the hydrated component
// tree structurally matches the server-rendered DOM (Vue tracks component
// boundaries with `<!---->` comment markers — omitting the wrapper here
// trips the hydration walker on `<HttpStatusCode/>`-bearing pages like
// NotFound). The client sink is never read, so a throwaway is fine.
const httpStatusSink = createHttpStatusSink();

const app = createSSRApp({
  render: () =>
    h(
      HttpStatusProvider,
      { sink: httpStatusSink },
      {
        default: () =>
          h(RouterProvider, { router }, { default: () => h(App) }),
      },
    ),
});

// Vue custom directive — body runs ONLY on the client (SSR pipeline
// skips directive lifecycle hooks). Demonstrates Vue's directive
// surface area: mounted/updated/unmounted hooks with reactive
// binding. See src/directives/track-view.ts.
app.directive("track-view", trackView);

app.mount("#root");
