import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { RouterProvider } from "@real-router/react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { routes } from "./routes";

import type { Route } from "@real-router/core";

import "../../../../shared/styles.css";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
  );
}

if (import.meta.hot) {
  import.meta.hot.accept("./routes", (module) => {
    if (module) {
      getRoutesApi(router).replace(module.routes as Route[]);
    }
  });
}
