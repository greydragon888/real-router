import { hydrateRouter } from "@real-router/ssr-utils";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrate } from "svelte";

import App from "./App.svelte";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

import type {
  DataLoaderFactoryMap,
  DataRouteEntry,
} from "@real-router/ssr-data-plugin";

declare global {
  var __SSR_STATE__: { path: string } | undefined;

  var __LOADER_CALLS__: Record<string, number> | undefined;
}

const router = createAppRouter();

const loaderCalls: Record<string, number> = {};

globalThis.__LOADER_CALLS__ = loaderCalls;

const instrumentedLoaders: DataLoaderFactoryMap = Object.fromEntries(
  (Object.entries(loaders) as [string, DataRouteEntry][]).map(
    ([name, entry]) => {
      // Object-form entries `{ ssr, loader? }` (e.g. `widget: { ssr: false }`)
      // pass through; the loader, if present, is wrapped below.
      if (typeof entry !== "function") {
        if (entry.loader === undefined) {
          return [name, entry];
        }

        const factory = entry.loader;

        return [
          name,
          {
            ssr: entry.ssr,
            loader: (r, getDep) => {
              const loader = factory(r, getDep);

              return (params) => {
                loaderCalls[name] = (loaderCalls[name] ?? 0) + 1;

                return loader(params);
              };
            },
          },
        ];
      }

      const factory = entry;

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
    },
  ),
) as DataLoaderFactoryMap;

router.usePlugin(ssrDataPluginFactory(instrumentedLoaders));

const ssrState = globalThis.__SSR_STATE__;

if (!ssrState) {
  throw new Error("Missing __SSR_STATE__ — server did not render this page");
}

await hydrateRouter(router, ssrState);

const rootElement = document.querySelector("#root");

if (rootElement) {
  hydrate(App, { target: rootElement, props: { router } });
}
