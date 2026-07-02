// real-router table-heap variant — build N synthetic routes (?n=N), then the
// harness measures retained JS heap (forced GC). Probes the memory cost of
// holding the route table: real-router precomputes a segment trie (O(1) match),
// so this is the memory side of wide-config's flat-CPU win.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { RouterProvider, useRoute } from "@real-router/react";
import { createRoot } from "react-dom/client";

import type { Route } from "@real-router/core";
import type { JSX } from "react";

const n = Number(new URLSearchParams(location.search).get("n") ?? "1");

const routes: Route[] = [
  { name: "home", path: "/" },
  ...Array.from({ length: n }, (_, i) => ({ name: `r${i}`, path: `/r${i}` })),
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

function App(): JSX.Element {
  const { route } = useRoute();
  return (
    <main data-testid="page-ready" data-n={String(n)}>
      {route.name}
    </main>
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
