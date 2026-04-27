import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { RouterProvider } from "@real-router/solid";
import { render } from "solid-js/web";

import { App } from "./App";
import { routes } from "./routes";
import { createDirectionTracker } from "../../../../../../shared/dom-utils";

import "../../../../../shared/styles.css";
import "./styles/animations.css";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

// `createDirectionTracker` MUST run before `usePlugin(browserPlugin)`.
// Both register window-level `popstate` listeners, and listeners fire
// in registration order. The browser-plugin's listener synchronously
// dispatches `subscribeLeave` — if the tracker is registered second,
// our flag setter runs *after* the leave callback has already read the
// (still-false) flag. Registering first guarantees correct ordering.
createDirectionTracker(router);

router.usePlugin(browserPluginFactory());

// All three coordinators (PageAnimator, HeroMorph, ListFlip) are
// mounted as Solid hooks inside <App />, each using `useRouteExit`
// from `@real-router/solid`. No router-level install needed.

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
