import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/preact";
import { render } from "preact";

import { App } from "./App";
import { baseRoutes } from "./routes";

import "../../../shared/styles.css";

const router = createRouter(baseRoutes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  render(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
    rootElement,
  );
}
