import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider, useRoute } from "@real-router/solid";
import { For } from "solid-js";
import { render } from "solid-js/web";

import { NAV } from "../../_shared/nav-meta";
import { About, Home, User } from "../../_shared/pages";

import type { Route } from "@real-router/core";
import type { JSX } from "solid-js";

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "user", path: "/users/:id" },
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});
router.usePlugin(browserPluginFactory());
await router.start();

function UserRoute(): JSX.Element {
  // useRoute() returns a Solid Accessor — call it to read the reactive state.
  const state = useRoute<{ id: string }>();
  return (
    <>
      <User id={state().route.params.id} />
      <Link
        routeName="user"
        routeParams={{ id: String(Number(state().route.params.id) + 1) }}
        data-testid="link-user-next"
      >
        Next
      </Link>
    </>
  );
}

function App(): JSX.Element {
  return (
    <>
      <nav>
        <For each={NAV}>
          {(n) => (
            <Link routeName={n.name} data-testid={n.testid}>
              {n.label}
            </Link>
          )}
        </For>
      </nav>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="about">
          <About />
        </RouteView.Match>
        <RouteView.Match segment="user">
          <UserRoute />
        </RouteView.Match>
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
