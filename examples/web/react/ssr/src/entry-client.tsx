import { browserPluginFactory } from "@real-router/browser-plugin";
import { hydrateRouter } from "@real-router/core/utils";
import { RouterProvider } from "@real-router/react";
import { hydrateRoot } from "react-dom/client";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";

declare global {
  interface Window {
    __SSR_STATE__?: { path: string };
  }
}

const router = createAppRouter({
  isAuthenticated: document.cookie.includes("auth=1"),
});

router.usePlugin(browserPluginFactory());

// Hydration (#563): use server's canonical state.path. serializeRouterState
// strips state.transition (regenerated on commit) but keeps name/params/path
// — only `path` is needed by hydrateRouter, the rest of the payload is
// available to app code for reading state.context.<namespace> if needed.
const ssrState = window.__SSR_STATE__;

if (ssrState) {
  await hydrateRouter(router, ssrState);
} else {
  await router.start();
}

const rootElement = document.querySelector("#root");

if (rootElement) {
  hydrateRoot(
    rootElement,
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
  );
}
