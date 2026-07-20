import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/ssr-utils";
import { RouterProvider } from "@real-router/preact";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrate } from "preact";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

declare global {
  // eslint-disable-next-line no-var
  var __SSR_STATE__: { path: string } | undefined;
}

const router = createAppRouter();

router.usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders));

const ssrState = globalThis.__SSR_STATE__;

await (ssrState ? hydrateRouter(router, ssrState) : router.start());

const rootElement = document.querySelector("#root");

if (rootElement) {
  hydrate(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
    rootElement,
  );
}
