// real-router deep variant — nested route tree (children) to depth 20, rendered
// with recursive nested <RouteView nodeName="deep.l1...lk">: RouteView.Self =
// leaf when this level is terminal, RouteView.Match segment="l{k+1}" = go deeper.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider } from "@real-router/react";
import { createRoot } from "react-dom/client";

import { CatalogItem } from "../../../_shared/pages";
import { DEEP_DEPTH, DEEP_TARGETS, deepName } from "../../../_shared/deep-spec";

import type { Route } from "@real-router/core";
import type { JSX } from "react";

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

function Level({ k, name }: { k: number; name: string }): JSX.Element {
  return (
    <div className="lvl">
      <RouteView nodeName={name}>
        <RouteView.Self>
          <CatalogItem n={String(k)} />
        </RouteView.Self>
        {k < DEEP_DEPTH ? (
          <RouteView.Match segment={`l${k + 1}`}>
            <Level k={k + 1} name={`${name}.l${k + 1}`} />
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
          {DEEP_TARGETS.map((d) => (
            <Link key={d} routeName={deepName(d)} data-testid={`link-deep-${d}`}>
              Depth {d}
            </Link>
          ))}
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
  createRoot(rootElement).render(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
  );
}
