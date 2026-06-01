import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { navigationPluginFactory } from "@real-router/navigation-plugin";
import { RouterProvider } from "@real-router/react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { routes } from "./routes";

import "../../../../../shared/styles.css";
import "./styles.css";

import type { Router } from "@real-router/core";

const search = globalThis.location.search;
const pluginKind: "browser" | "navigation" = search.includes("plugin=browser")
  ? "browser"
  : "navigation";
const spyMode: "provider" | "per-route" = search.includes("spy=per-route")
  ? "per-route"
  : "provider";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

if (pluginKind === "browser") {
  router.usePlugin(browserPluginFactory());
} else {
  router.usePlugin(navigationPluginFactory());
}

await router.start();

(globalThis as unknown as { __router: Router }).__router = router;

function applyInitialAnchorScroll(): void {
  if (globalThis.location.hash.length <= 1) {
    return;
  }

  let id: string;

  try {
    id = decodeURIComponent(globalThis.location.hash.slice(1));
  } catch {
    id = globalThis.location.hash.slice(1);
  }

  let attempts = 0;
  const tryScroll = (): void => {
    const element = document.getElementById(id);

    if (element) {
      element.scrollIntoView();

      return;
    }

    if (attempts < 20) {
      attempts += 1;
      setTimeout(tryScroll, 30);
    }
  };

  setTimeout(tryScroll, 30);
}

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(
    <App router={router} pluginKind={pluginKind} spyMode={spyMode} />,
  );

  applyInitialAnchorScroll();
}

export { router };

export type PluginKind = typeof pluginKind;

export type SpyMode = typeof spyMode;
