import { hydrateRouter } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/solid";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrate } from "solid-js/web";

import { App } from "./App";
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

router.usePlugin(ssrDataPluginFactory(instrumentedLoaders));

const ssrState = globalThis.__SSR_STATE__;

if (!ssrState) {
  throw new Error("Missing __SSR_STATE__ — server did not render this page");
}

await hydrateRouter(router, ssrState);

const rootElement = document.querySelector("#root");

if (rootElement) {
  hydrate(
    () => (
      <RouterProvider router={router}>
        <App />
      </RouterProvider>
    ),
    rootElement,
  );
}
