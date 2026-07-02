import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouteView, RouterProvider, useRoute } from "@real-router/react";
import { createRoot } from "react-dom/client";

import { NAV } from "../../_shared/nav-meta";
import { About, Home, User } from "../../_shared/pages";

import type { Route } from "@real-router/core";
import type { JSX } from "react";

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
  const { route } = useRoute<{ id: string }>();
  const id = route.params.id;
  const next = String(Number(id) + 1);

  return (
    <>
      <User id={id} />
      <Link
        routeName="user"
        routeParams={{ id: next }}
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
        {NAV.map((n) => (
          <Link key={n.name} routeName={n.name} data-testid={n.testid}>
            {n.label}
          </Link>
        ))}
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
  createRoot(rootElement).render(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
  );
}
