// real-router params variant — routes with 1/4/16 path params. The matcher
// (segment trie) collects params during the walk; the leaf reports how many it
// extracted (data-count) so the driver can confirm arrival.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider, useRoute } from "@real-router/react";
import { createRoot } from "react-dom/client";

import {
  PARAM_COUNTS,
  paramPattern,
  paramValues,
} from "../../../_shared/param-spec";

import type { Route } from "@real-router/core";
import type { JSX } from "react";

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
  const { route } = useRoute();
  const count = Object.keys(route.params).filter((k) => /^k\d+$/.test(k)).length;
  return (
    <main data-testid="page-param" data-count={count}>
      {count} params
    </main>
  );
}

function App(): JSX.Element {
  return (
    <>
      <nav>
        {PARAM_COUNTS.map((n) => (
          <Link
            key={n}
            routeName={`p${n}`}
            routeParams={paramValues(n)}
            data-testid={`link-param-${n}`}
          >
            {n}
          </Link>
        ))}
      </nav>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <main data-testid="page-home">Home</main>
        </RouteView.Match>
        {PARAM_COUNTS.map((n) => (
          <RouteView.Match key={n} segment={`p${n}`}>
            <ParamLeaf />
          </RouteView.Match>
        ))}
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
