import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/solid";
import { render } from "solid-js/web";

import { App } from "./App";
import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";
import { routes } from "./routes";

import "../../../shared/styles.css";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory(), lifecyclePluginFactory());

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  render(
    () => (
      <RouterProvider router={router}>
        <App />
      </RouterProvider>
    ),
    rootElement,
  );
}
