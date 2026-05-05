import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/preact";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { hydrate, render } from "preact";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";
import { loaders } from "./router/loaders";

declare global {
  // eslint-disable-next-line no-var -- script-injected by ssg-build.ts
  var __SSR_STATE__: { path: string } | undefined;
}

const router = createAppRouter();

router.usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders));

const ssrState = globalThis.__SSR_STATE__;

await (ssrState ? hydrateRouter(router, ssrState) : router.start(window.location.pathname));

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
