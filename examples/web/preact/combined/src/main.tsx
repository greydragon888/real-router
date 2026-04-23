import { RouterProvider } from "@real-router/preact";
import { render } from "preact";

import { App } from "./App";
import { router } from "./router";

import "../../../../shared/styles.css";

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  render(
    <RouterProvider router={router} announceNavigation>
      <App />
    </RouterProvider>,
    rootElement,
  );
}
