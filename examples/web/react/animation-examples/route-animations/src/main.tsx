import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/react";
import { createRoot } from "react-dom/client";

import { installRouteAnimations } from "./animations-policy";
import { App } from "./App";
import { routes } from "./routes";

import "../../../../../shared/styles.css";
import "./styles/animations.css";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

installRouteAnimations(router);

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
  );
}
