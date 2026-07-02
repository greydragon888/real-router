// real-router links variant — 100 active-aware <Link activeClassName> to sibling
// /tab/i routes. Each Link subscribes to active state → navigation recomputes
// active across all 100 (cached createActiveRouteSource per Link).
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouterProvider, useRoute } from "@real-router/solid";
import { For, Show } from "solid-js";
import { render } from "solid-js/web";

import { tabs } from "../../../_shared/links-spec";

import type { Route } from "@real-router/core";
import type { JSX } from "solid-js";

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

function App(): JSX.Element {
  const state = useRoute();
  const n = (): string =>
    state().route.name.startsWith("tab") ? state().route.name.slice(3) : "";

  return (
    <>
      <nav>
        <For each={tabs}>
          {(i) => (
            <Link
              routeName={`tab${i}`}
              activeClassName="active"
              data-testid={`link-tab-${i}`}
            >
              Tab {i}
            </Link>
          )}
        </For>
      </nav>
      <Show
        when={n()}
        fallback={
          <main data-testid="page-home">
            <h1>Home</h1>
          </main>
        }
      >
        <main data-testid="page-tab" data-n={n()}>
          <h1>Tab {n()}</h1>
        </main>
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
