import { RouterProvider } from "@real-router/react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { router } from "./router";

import "../../../../shared/styles.css";

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(
    <RouterProvider router={router} announceNavigation>
      <App />
    </RouterProvider>,
  );
}
