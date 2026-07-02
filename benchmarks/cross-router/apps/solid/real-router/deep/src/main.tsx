// real-router deep variant — nested route tree (children) to depth DEEP_DEPTH,
// rendered with recursive nested <RouteView nodeName="deep.l1...lk">:
// RouteView.Self = leaf when this level is terminal, RouteView.Match
// segment="l{k+1}" = go deeper.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider } from "@real-router/solid";
import { For } from "solid-js";
import { render } from "solid-js/web";

import { CatalogItem } from "../../../_shared/pages";
import { DEEP_DEPTH, DEEP_TARGETS, deepName } from "../../../_shared/deep-spec";

import type { Route } from "@real-router/core";
import type { JSX } from "solid-js";

function buildRoute(k: number): Route {
  return {
    name: `l${k}`,
    path: `/l${k}`,
    children: k < DEEP_DEPTH ? [buildRoute(k + 1)] : [],
  };
}

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "deep", path: "/deep", children: [buildRoute(1)] },
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

// props NOT destructured — Solid props are getters (keeps k/name live).
function Level(props: { k: number; name: string }): JSX.Element {
  return (
    <div class="lvl">
      <RouteView nodeName={props.name}>
        <RouteView.Self>
          <CatalogItem n={String(props.k)} />
        </RouteView.Self>
        {props.k < DEEP_DEPTH ? (
          <RouteView.Match segment={`l${props.k + 1}`}>
            <Level k={props.k + 1} name={`${props.name}.l${props.k + 1}`} />
          </RouteView.Match>
        ) : null}
      </RouteView>
    </div>
  );
}

function App(): JSX.Element {
  return (
    <RouteView nodeName="">
      <RouteView.Match segment="home">
        <nav>
          <For each={DEEP_TARGETS}>
            {(d) => (
              <Link routeName={deepName(d)} data-testid={`link-deep-${d}`}>
                Depth {d}
              </Link>
            )}
          </For>
        </nav>
      </RouteView.Match>
      <RouteView.Match segment="deep">
        <RouteView nodeName="deep">
          <RouteView.Match segment="l1">
            <Level k={1} name="deep.l1" />
          </RouteView.Match>
        </RouteView>
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
