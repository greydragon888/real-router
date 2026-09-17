import { RouterProvider } from "@real-router/react";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrateRouter } from "@real-router/ssr-utils";
import { hydrateRoot } from "react-dom/client";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

import type {
  DataLoaderFactoryMap,
  DataLoaderFnFactory,
  DataRouteEntry,
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

// Wrap each loader factory with a call counter for the post-hydration
// loader-skip e2e tests. Object-form entries (e.g. `widget: { ssr: false }`)
// have no factory to wrap — pass them through untouched. Without this guard
// the wrapper crashes at `factory(...)` during plugin registration, breaking
// hydration entirely.
const instrumentedLoaders: DataLoaderFactoryMap = Object.fromEntries(
  (Object.entries(loaders) as [string, DataRouteEntry][]).map(
    ([name, entry]) => {
      if (typeof entry === "function") {
        const factory = entry as DataLoaderFnFactory;
        const wrapped: DataLoaderFnFactory = (r, getDep) => {
          const loader = factory(r, getDep);

          return (params, ctx) => {
            loaderCalls[name] = (loaderCalls[name] ?? 0) + 1;

            return loader(params, ctx);
          };
        };

        return [name, wrapped];
      }

      if (typeof entry.loader !== "function") {
        return [name, entry];
      }

      const factory = entry.loader;
      const wrapped: DataLoaderFnFactory = (r, getDep) => {
        const loader = factory(r, getDep);

        return (params, ctx) => {
          loaderCalls[name] = (loaderCalls[name] ?? 0) + 1;

          return loader(params, ctx);
        };
      };

      return [name, { ...entry, loader: wrapped }];
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
  hydrateRoot(
    rootElement,
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
  );
}
