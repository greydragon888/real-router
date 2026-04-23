import { createRouter } from "@real-router/core";
import { navigationPluginFactory } from "@real-router/navigation-plugin";
import { RouterProvider } from "@real-router/react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { installConfirmLeaveGuard } from "./components/ConfirmLeaveGuard";
import { routes } from "./routes";

import "../../../shared/styles.css";
import "./styles.css";

if (!("navigation" in globalThis)) {
  document.body.innerHTML = `
    <div class="fallback">
      <h1>Navigation API is required</h1>
      <p>This example showcases features exclusive to the Navigation API
         (~89% browser support). Open in Chrome, Edge, or any Chromium-based
         browser. Safari &lt; 16.4 and Firefox do not support it yet.</p>
      <p><a href="https://caniuse.com/mdn-api_navigation">caniuse.com/mdn-api_navigation</a></p>
    </div>`;
} else {
  const router = createRouter(routes, {
    defaultRoute: "home",
    allowNotFound: true,
  });

  router.usePlugin(navigationPluginFactory());
  installConfirmLeaveGuard(router);

  await router.start();

  const rootElement = document.querySelector("#root");

  if (rootElement) {
    createRoot(rootElement).render(
      <RouterProvider router={router}>
        <App />
      </RouterProvider>,
    );
  }
}
