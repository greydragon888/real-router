// real-router wide variant — 1000 flat sibling routes (/catalog/item-1..1000).
// Matcher is a segment trie → match cost should stay ~flat across N. 1000
// distinct static routes are rendered via a single name-parsing branch
// (idiomatic for generated route tables; you don't write 1000 <RouteView.Match>).
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouterProvider, useRoute } from "@real-router/react";
import { createRoot } from "react-dom/client";

import { CatalogItem } from "../../../_shared/pages";
import { WIDE_TARGETS, wideItems } from "../../../_shared/wide-spec";

import type { Route } from "@real-router/core";
import type { JSX } from "react";

const routes: Route[] = [
  { name: "home", path: "/" },
  ...wideItems.map((n) => ({ name: `item${n}`, path: `/catalog/item-${n}` })),
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

function App(): JSX.Element {
  const { route } = useRoute();
  const { name } = route;

  return (
    <>
      <nav>
        {WIDE_TARGETS.map((n) => (
          <Link key={n} routeName={`item${n}`} data-testid={`link-item-${n}`}>
            Item {n}
          </Link>
        ))}
      </nav>
      {name.startsWith("item") ? (
        <CatalogItem n={name.slice(4)} />
      ) : (
        <main data-testid="page-home">
          <h1>Home</h1>
        </main>
      )}
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
