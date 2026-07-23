// real-router search-param-scaling variant — routes with N *query* params
// (/sN?k1=v1&...&kN=vN). real-router declares query params in the path pattern
// (`?k1&k2&...`); query values live in `route.search`, parsed EAGERLY by the matcher
// (search-params). The leaf reads EVERY value (readSearch → checksum) so the number
// is honest, not a keys-only skim.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider, useRoute } from "@real-router/react";
import { createRoot } from "react-dom/client";

import {
  SEARCH_COUNTS,
  searchDecl,
  searchValues,
  readSearch,
} from "../../../_shared/search-param-spec";

import type { Route } from "@real-router/core";
import type { JSX } from "react";

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
  const { route } = useRoute();
  const { count, checksum } = readSearch(Object.entries(route.search));
  return (
    <main data-testid="page-search" data-count={count}>
      {count} search · Σ{checksum}
    </main>
  );
}

function App(): JSX.Element {
  return (
    <>
      <nav>
        {SEARCH_COUNTS.map((n) => (
          <Link
            key={n}
            routeName={`s${n}`}
            routeSearch={searchValues(n)}
            data-testid={`link-search-${n}`}
          >
            {n}
          </Link>
        ))}
      </nav>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <main data-testid="page-home">Home</main>
        </RouteView.Match>
        {SEARCH_COUNTS.map((n) => (
          <RouteView.Match key={n} segment={`s${n}`}>
            <SearchLeaf />
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
