import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { hashPluginFactory } from "@real-router/hash-plugin";
import { RouterProvider } from "@real-router/react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { routes } from "./routes";

import "../../../../shared/styles.css";

// Plugin selection driven by `?plugin=hash` in the URL.
//
// The default `browser-plugin` build demonstrates the full <Link hash> feature
// surface from #532 — tab-style UI driven by `state.context.url.hash`,
// tri-state opts.hash, navigateWithHash auto-force, F5 priming.
//
// `?plugin=hash` switches to `hash-plugin` to demonstrate the documented
// limitation: hash-plugin uses `#` as the route delimiter, so URL fragments
// are silently ignored and a one-time `console.warn` is emitted.
const useHashPlugin =
  globalThis.location.search.includes("plugin=hash") ||
  globalThis.location.hash.startsWith("#!");

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

if (useHashPlugin) {
  router.usePlugin(hashPluginFactory({ hashPrefix: "!" }));
} else {
  router.usePlugin(browserPluginFactory());
}

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(
    <RouterProvider router={router}>
      <App pluginKind={useHashPlugin ? "hash" : "browser"} />
    </RouterProvider>,
  );
}
