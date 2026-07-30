// FEATURE DEMO — typed/validated search (real-router). A zod `searchSchema` on
// the route validates/types the query: ?n=5 → route.search.n is a number 5
// (not the raw string "5"). react-router/wouter have no schema API (N/A).
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { RouteView, RouterProvider, useRoute } from "@real-router/solid";
import { searchSchemaPlugin } from "@real-router/search-schema-plugin";
import { render } from "solid-js/web";
import { z } from "zod";

import type { Route } from "@real-router/core";
import type { JSX } from "solid-js";

const searchSchema = z.object({ n: z.coerce.number().default(1) });

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "search", path: "/search?n", searchSchema },
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
  queryParams: { numberFormat: "auto" },
});

router.usePlugin(
  browserPluginFactory(),
  searchSchemaPlugin({ mode: "development" }),
);

await router.start();

function SearchPage(): JSX.Element {
  const state = useRoute();
  const n = (): number => state().route.search.n as number;
  return (
    <main>
      <span data-testid="validated-n">{String(n())}</span>
      <span data-testid="validated-type">{typeof n()}</span>
    </main>
  );
}

function App(): JSX.Element {
  return (
    <RouteView nodeName="">
      <RouteView.Match segment="home">
        <main data-testid="page-home">Home</main>
      </RouteView.Match>
      <RouteView.Match segment="search">
        <SearchPage />
      </RouteView.Match>
    </RouteView>
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
