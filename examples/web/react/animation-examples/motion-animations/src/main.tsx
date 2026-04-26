import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/react";
import { MotionConfig } from "motion/react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { routes } from "./routes";

import "../../../../../shared/styles.css";
import "./styles/styles.css";

const router = createRouter(routes);

router.usePlugin(browserPluginFactory());

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(
    <RouterProvider router={router}>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </RouterProvider>,
  );
}
