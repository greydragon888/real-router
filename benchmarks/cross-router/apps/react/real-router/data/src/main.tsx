// FEATURE DEMO — data on navigation (real-router). Idiomatic real-router data:
// route `onEnter` (lifecycle-plugin) fires on navigation and loads into an
// external store; the component reads it via useSyncExternalStore. `loaded-42`
// exists ONLY after navigating to /data → proves it was loaded on nav.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";
import { Link, RouteView, RouterProvider } from "@real-router/react";
import { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";

import type { Route } from "@real-router/core";
import type { JSX } from "react";

const data = new Map<string, unknown>();
const listeners = new Set<() => void>();
const store = {
  get: (key: string) => data.get(key),
  set(key: string, value: unknown) {
    data.set(key, value);
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "data",
    path: "/data",
    // loader tied to navigation (lifecycle-plugin onEnter factory)
    onEnter: () => () => store.set("data:value", "loaded-42"),
  },
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory(), lifecyclePluginFactory());

await router.start();

function DataPage(): JSX.Element {
  const value = useSyncExternalStore(
    store.subscribe,
    () => store.get("data:value") as string | undefined,
  );
  return value ? (
    <main data-testid="loaded-value">{value}</main>
  ) : (
    <main data-testid="loading">loading…</main>
  );
}

function App(): JSX.Element {
  return (
    <>
      <nav>
        <Link routeName="data" data-testid="link-data">
          Data
        </Link>
      </nav>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <main data-testid="page-home">Home</main>
        </RouteView.Match>
        <RouteView.Match segment="data">
          <DataPage />
        </RouteView.Match>
      </RouteView>
    </>
  );
}

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
  );
}
