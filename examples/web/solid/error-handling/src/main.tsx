import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/solid";
import { render } from "solid-js/web";

import { App } from "./App";
import { errorStore } from "./error-store";
import { routes } from "./routes";

import type { PluginFactory } from "@real-router/core";
import "../../../../shared/styles.css";

const errorLoggerPlugin: PluginFactory = () => ({
  onTransitionError(_toState, _fromState, err) {
    errorStore.add(err);
  },
  onTransitionCancel(toState, fromState) {
    errorStore.addCancel(toState, fromState);
  },
});

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory(), errorLoggerPlugin);

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
