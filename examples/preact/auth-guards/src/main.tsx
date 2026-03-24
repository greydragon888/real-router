import { RouterProvider } from "@real-router/preact";
import { render } from "preact";

import { App } from "./App";
import { router } from "./router";

import "../../../shared/styles.css";

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
