import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/ssr-utils";
import { RouterProvider } from "@real-router/react";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrateRoot } from "react-dom/client";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

declare global {
  interface Window {
    __SSR_STATE__?: { path: string };
  }
}

const router = createAppRouter();

router.usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders));

const ssrState = globalThis.__SSR_STATE__;

await (ssrState ? hydrateRouter(router, ssrState) : router.start());

const rootElement = document.querySelector("#root");

if (rootElement) {
  hydrateRoot(
    rootElement,
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
  );
}
