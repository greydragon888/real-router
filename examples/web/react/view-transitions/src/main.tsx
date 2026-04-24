import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { routes } from "./routes";

import "../../../../shared/styles.css";
import "./styles/transitions.css";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

// Direction-aware: expose nav direction as a data attribute on <html> so
// CSS can key direction-specific keyframes off it. popstate fires when the
// user clicks back/forward in the browser; any other source of navigation
// (Link click, router.navigate) is treated as forward. The flag is consumed
// in subscribeLeave so the attribute value is ready when the VT snapshots
// the old DOM.
if (typeof globalThis.window !== "undefined") {
  let popstateFlag = false;

  document.documentElement.dataset.navDirection = "forward";
  globalThis.addEventListener("popstate", () => {
    popstateFlag = true;
  });
  router.subscribeLeave(() => {
    document.documentElement.dataset.navDirection = popstateFlag
      ? "back"
      : "forward";
    popstateFlag = false;
  });
}

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(
    <RouterProvider router={router} viewTransitions={true}>
      <App />
    </RouterProvider>,
  );
}
