import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/preact";
import { MotionConfig } from "motion/react";
import { render } from "preact";

import { App } from "./App";
import { routes } from "./routes";

import "../../../../../shared/styles.css";
import "./styles/styles.css";

const router = createRouter(routes);

router.usePlugin(browserPluginFactory());

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  render(
    <RouterProvider router={router}>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </RouterProvider>,
    rootElement,
  );
}
