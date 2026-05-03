import { hydrateRouter } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/solid";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrate } from "solid-js/web";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

declare global {
  // eslint-disable-next-line no-var
  var __SSR_STATE__: { path: string } | undefined;
}

const router = createAppRouter();

router.usePlugin(ssrDataPluginFactory(loaders));

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
