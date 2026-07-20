import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/ssr-utils";
import { RouterProvider } from "@real-router/preact";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrate, render } from "preact";

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

await (ssrState
  ? hydrateRouter(router, ssrState)
  : router.start(globalThis.location.pathname));

const rootElement = document.querySelector("#root");

if (rootElement) {
  const app = (
    <RouterProvider router={router}>
      <App />
    </RouterProvider>
  );

  // Detect SSG-prerendered content vs dev mode (Vite dev serves a
  // bare index.html with empty #root). Hydrate when SSR'd; render
  // fresh otherwise.
  if (rootElement.firstElementChild) {
    hydrate(app, rootElement);
  } else {
    render(app, rootElement);
  }
}
