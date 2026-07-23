// real-router (Solid) search-param-scaling variant — routes with N query params
// (/sN?k1=v1&...&kN=vN). Query declared in the path pattern (`?k1&...`), lives in
// route.search, parsed eagerly. The leaf reads EVERY value (readSearch, once via
// createMemo).
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider, useRoute } from "@real-router/solid";
import { For, createMemo } from "solid-js";
import { render } from "solid-js/web";

import {
  SEARCH_COUNTS,
  searchDecl,
  searchValues,
  readSearch,
} from "../../../_shared/search-param-spec";

import type { Route } from "@real-router/core";
import type { JSX } from "solid-js";

const routes: Route[] = [
  { name: "home", path: "/" },
  ...SEARCH_COUNTS.map((n) => ({ name: `s${n}`, path: `/s${n}${searchDecl(n)}` })),
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

function SearchLeaf(): JSX.Element {
  const state = useRoute();
  const info = createMemo(() => readSearch(Object.entries(state().route.search)));
  return (
    <main data-testid="page-search" data-count={info().count}>
      {info().count} search · Σ{info().checksum}
    </main>
  );
}

function App(): JSX.Element {
  return (
    <>
      <nav>
        <For each={SEARCH_COUNTS}>
          {(n) => (
            <Link
              routeName={`s${n}`}
              routeSearch={searchValues(n)}
              data-testid={`link-search-${n}`}
            >
              {n}
            </Link>
          )}
        </For>
      </nav>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <main data-testid="page-home">Home</main>
        </RouteView.Match>
        {SEARCH_COUNTS.map((n) => (
          <RouteView.Match segment={`s${n}`}>
            <SearchLeaf />
          </RouteView.Match>
        ))}
      </RouteView>
    </>
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
