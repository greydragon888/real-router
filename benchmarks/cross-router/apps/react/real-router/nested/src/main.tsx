// real-router nested variant — shared layout chain of DEPTH D (from `?n=`, default 1)
// with two sibling leaves a/b at the bottom. Switching a↔b keeps the whole D-deep
// chain mounted (RouteView reuses every ancestor); only the inner Match swaps — so
// the curve tests whether swap cost stays flat with depth (true reuse) or grows.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider } from "@real-router/react";
import { createRoot } from "react-dom/client";

import type { Route } from "@real-router/core";
import type { JSX } from "react";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const DEPTH = _n > 0 ? _n : 1; // shared-layout levels above the a/b switch

// Route tree: sec(/sec) → l2(/l2) → … → lDEPTH → { a, b }. Level 1 is "sec".
function buildRoutes(): Route[] {
  const ab: Route[] = [
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ];
  let node: Route = { name: `l${DEPTH}`, path: `/l${DEPTH}`, children: ab };
  for (let k = DEPTH - 1; k >= 2; k--) {
    node = { name: `l${k}`, path: `/l${k}`, children: [node] };
  }
  const sec: Route =
    DEPTH === 1
      ? { name: "sec", path: "/sec", children: ab }
      : { name: "sec", path: "/sec", children: [node] };
  return [{ name: "home", path: "/" }, sec];
}

const router = createRouter(buildRoutes(), {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

function Leaf({ n }: { n: string }): JSX.Element {
  return (
    <main data-testid="page-item" data-n={n}>
      <h1>{n}</h1>
    </main>
  );
}

// One layout level. At the bottom (level === DEPTH) it owns the a/b nav + switch;
// above, it reuses via a single Match to the next level.
function Chain({
  level,
  dotted,
}: {
  level: number;
  dotted: string;
}): JSX.Element {
  if (level === DEPTH) {
    return (
      <div className="sec">
        <nav>
          <Link routeName={`${dotted}.a`} data-testid="link-sec-a">
            A
          </Link>
          <Link routeName={`${dotted}.b`} data-testid="link-sec-b">
            B
          </Link>
        </nav>
        <RouteView nodeName={dotted}>
          <RouteView.Match segment="a">
            <Leaf n="a" />
          </RouteView.Match>
          <RouteView.Match segment="b">
            <Leaf n="b" />
          </RouteView.Match>
        </RouteView>
      </div>
    );
  }
  const childSeg = `l${level + 1}`;
  return (
    <div className="lvl">
      <RouteView nodeName={dotted}>
        <RouteView.Match segment={childSeg}>
          <Chain level={level + 1} dotted={`${dotted}.${childSeg}`} />
        </RouteView.Match>
      </RouteView>
    </div>
  );
}

function App(): JSX.Element {
  return (
    <RouteView nodeName="">
      <RouteView.Match segment="home">
        <main data-testid="page-home">
          <h1>Home</h1>
        </main>
      </RouteView.Match>
      <RouteView.Match segment="sec">
        <Chain level={1} dotted="sec" />
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
