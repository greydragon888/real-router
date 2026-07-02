import { RouterProvider } from "@real-router/solid";
import { render } from "solid-js/web";

import { App } from "./App";
import { router } from "./router";

import "../../../../shared/styles.css";

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  render(
    () => (
      <RouterProvider
        router={router}
        announceNavigation={{
          // announceNavigation accepts RouteAnnouncerOptions — a custom
          // getAnnouncementText overrides the default "Navigated to
          // <route.name>"; `prefix` is the other option.
          getAnnouncementText: (route) => `Now on the ${route.name} page`,
        }}
      >
        <App />
      </RouterProvider>
    ),
    rootElement,
  );
}
