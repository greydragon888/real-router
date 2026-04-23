import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/preact";
import { render } from "preact";

import { App } from "./App";
import { routes } from "./routes";

import "../../../../shared/styles.css";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

const root = document.querySelector("#root");

if (root) {
  render(
    <RouterProvider router={router} scrollRestoration={{ mode: "restore" }}>
      <App />
    </RouterProvider>,
    root,
  );
}
