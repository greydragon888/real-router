import { browserPluginFactory } from "@real-router/browser-plugin";
import { RouterProvider } from "@real-router/react";
import { hydrateRoot } from "react-dom/client";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";

const router = createAppRouter({
  isAuthenticated: document.cookie.includes("auth=1"),
});

router.usePlugin(browserPluginFactory());

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  hydrateRoot(
    rootElement,
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
  );
}
