// real-router wide variant — 1000 flat sibling routes (/catalog/item-1..1000).
// Matcher is a segment trie → match cost should stay ~flat across N. 1000
// distinct static routes are rendered via a single name-parsing branch
// (idiomatic for generated route tables; you don't write 1000 <RouteView.Match>).
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouterProvider, useRoute } from "@real-router/solid";
import { For, Show } from "solid-js";
import { render } from "solid-js/web";

import { CatalogItem } from "../../../_shared/pages";
import { WIDE_TARGETS, wideItems } from "../../../_shared/wide-spec";

import type { Route } from "@real-router/core";
import type { JSX } from "solid-js";

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
  // useRoute() returns a Solid Accessor — call it to read the reactive state.
  const state = useRoute();

  return (
    <>
      <nav>
        <For each={WIDE_TARGETS}>
          {(n) => (
            <Link routeName={`item${n}`} data-testid={`link-item-${n}`}>
              Item {n}
            </Link>
          )}
        </For>
      </nav>
      <Show
        when={state().route.name.startsWith("item")}
        fallback={
          <main data-testid="page-home">
            <h1>Home</h1>
          </main>
        }
      >
        <CatalogItem n={state().route.name.slice(4)} />
      </Show>
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
