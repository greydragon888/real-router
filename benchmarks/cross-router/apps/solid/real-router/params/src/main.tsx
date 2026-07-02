// real-router params variant — routes with 1/10/100 path params. The matcher
// (segment trie) collects params during the walk; the leaf reports how many it
// extracted (data-count) so the driver can confirm arrival.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider, useRoute } from "@real-router/solid";
import { For } from "solid-js";
import { render } from "solid-js/web";

import {
  PARAM_COUNTS,
  paramPattern,
  paramValues,
} from "../../../_shared/param-spec";

import type { Route } from "@real-router/core";
import type { JSX } from "solid-js";

const routes: Route[] = [
  { name: "home", path: "/" },
  ...PARAM_COUNTS.map((n) => ({ name: `p${n}`, path: paramPattern(n, ":") })),
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

function ParamLeaf(): JSX.Element {
  const state = useRoute();
  const count = (): number =>
    Object.keys(state().route.params).filter((k) => /^k\d+$/.test(k)).length;
  return (
    <main data-testid="page-param" data-count={count()}>
      {count()} params
    </main>
  );
}

function App(): JSX.Element {
  return (
    <>
      <nav>
        <For each={PARAM_COUNTS}>
          {(n) => (
            <Link
              routeName={`p${n}`}
              routeParams={paramValues(n)}
              data-testid={`link-param-${n}`}
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
        {/* .map() (not <For>) generates the Match markers: RouteView collects
            marker objects out of nested arrays — the test-proven idiom (see
            RouteView.test.tsx "collectElements handles nested array of markers
            from map()"). Mirrors the react reference 1:1. */}
        {PARAM_COUNTS.map((n) => (
          <RouteView.Match segment={`p${n}`}>
            <ParamLeaf />
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
