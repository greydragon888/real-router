// real-router links variant — 100 active-aware <Link activeClassName> to sibling
// /tab/i routes. Each Link subscribes to active state → navigation recomputes
// active across all 100 (cached createActiveRouteSource per Link).
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouterProvider, useRoute } from "@real-router/react";
import { createRoot } from "react-dom/client";

import { tabs } from "../../../_shared/links-spec";

import type { Route } from "@real-router/core";
import type { JSX } from "react";

const routes: Route[] = [
  { name: "home", path: "/" },
  ...tabs.map((i) => ({ name: `tab${i}`, path: `/tab/${i}` })),
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

// The route-dependent <main> lives in its own route-subscribed component, so the
// App shell that mounts the N <Link>s does NOT call useRoute() and never
// re-renders on navigation — mirrors react-router's <Outlet> app. Without this,
// App's useRoute() re-renders the whole shell every nav, re-creating all N
// <Link> elements → O(N) reconciliation per navigation (memo softens the child
// re-render, but the shell walk is still O(N)). Symmetric with the vue variant.
function TabView(): JSX.Element {
  const { route } = useRoute();
  const n = route.name.startsWith("tab") ? route.name.slice(3) : "";

  return n ? (
    <main data-testid="page-tab" data-n={n}>
      <h1>Tab {n}</h1>
    </main>
  ) : (
    <main data-testid="page-home">
      <h1>Home</h1>
    </main>
  );
}

function App(): JSX.Element {
  return (
    <>
      <nav>
        {tabs.map((i) => (
          <Link
            key={i}
            routeName={`tab${i}`}
            activeClassName="active"
            data-testid={`link-tab-${i}`}
          >
            Tab {i}
          </Link>
        ))}
      </nav>
      <TabView />
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
