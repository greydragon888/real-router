// real-router table-heap variant — build N synthetic routes (?n=N), then the
// harness measures retained JS heap (forced GC). Probes the memory cost of
// holding the route table: real-router precomputes a segment trie (O(1) match),
// so this is the memory side of wide-config's flat-CPU win.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { RouterProvider, useRoute } from "@real-router/solid";
import { render } from "solid-js/web";

import type { Route } from "@real-router/core";
import type { JSX } from "solid-js";

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
  const state = useRoute();
  return (
    <main data-testid="page-ready" data-n={String(n)}>
      {state().route.name}
    </main>
  );
}

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
