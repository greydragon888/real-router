import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/ssr-utils";
import { RouterProvider } from "@real-router/solid";
import {
  HttpStatusProvider,
  createHttpStatusSink,
} from "@real-router/solid/ssr";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrate } from "solid-js/web";

import { lookupUserFromCookies, parseCookieHeader } from "./_known-users";
import { App } from "./App";
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

// Mount <HttpStatusProvider> on the client too so the hydrated component
// tree structurally matches the server-rendered DOM. Solid emits hydration
// markers (`data-hk`) for every component boundary; if the client tree has
// one fewer boundary than the SSR HTML, every subsequent marker drifts and
// hydration walker fails. The client sink is never read, so a throwaway is
// fine.
const httpStatusSink = createHttpStatusSink();

if (rootElement) {
  hydrate(
    () => (
      <HttpStatusProvider sink={httpStatusSink}>
        <RouterProvider router={router}>
          <App />
        </RouterProvider>
      </HttpStatusProvider>
    ),
    rootElement,
  );
}
