import { browserPluginFactory } from "@real-router/browser-plugin";
import { RouterProvider } from "@real-router/react";
import { createRoot, hydrateRoot } from "react-dom/client";

import { App } from "./App";
import { createAppRouter } from "./router/createAppRouter";

const router = createAppRouter();

router.usePlugin(browserPluginFactory());

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  const app = (
    <RouterProvider router={router}>
      <App />
    </RouterProvider>
  );

  if (rootElement.firstElementChild) {
    hydrateRoot(rootElement, app);
  } else {
    createRoot(rootElement).render(app);
  }
}
