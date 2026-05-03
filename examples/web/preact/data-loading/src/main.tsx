import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";
import { RouterProvider } from "@real-router/preact";
import { preloadPluginFactory } from "@real-router/preload-plugin";
import { render } from "preact";

import { App } from "./App";
import { routes } from "./routes";

import "../../../../shared/styles.css";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(
  browserPluginFactory(),
  lifecyclePluginFactory(),
  preloadPluginFactory(),
);

await router.start();

const root = document.querySelector("#root");

if (root) {
  render(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
    root,
  );
}
