// real-router nested variant — shared SectionLayout (nodeName="sec") with two
// sibling leaves a/b. Switching a↔b keeps SectionLayout mounted (RouteView
// reuses the parent); only the inner Match swaps.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider } from "@real-router/solid";
import { render } from "solid-js/web";

import type { Route } from "@real-router/core";
import type { JSX } from "solid-js";

const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "sec",
    path: "/sec",
    children: [
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ],
  },
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

// props NOT destructured — Solid props are getters.
function Leaf(props: { n: string }): JSX.Element {
  return (
    <main data-testid="page-item" data-n={props.n}>
      <h1>{props.n}</h1>
    </main>
  );
}

function SectionLayout(): JSX.Element {
  return (
    <div class="sec">
      <nav>
        <Link routeName="sec.a" data-testid="link-sec-a">
          A
        </Link>
        <Link routeName="sec.b" data-testid="link-sec-b">
          B
        </Link>
      </nav>
      <RouteView nodeName="sec">
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

function App(): JSX.Element {
  return (
    <RouteView nodeName="">
      <RouteView.Match segment="home">
        <main data-testid="page-home">
          <h1>Home</h1>
        </main>
      </RouteView.Match>
      <RouteView.Match segment="sec">
        <SectionLayout />
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
