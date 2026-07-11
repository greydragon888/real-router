import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { persistentParamsPluginFactory } from "@real-router/persistent-params-plugin";
import { Link, RouteView, RouterProvider, useRoute } from "@real-router/react";
import { searchSchemaPlugin } from "@real-router/search-schema-plugin";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { createRoot } from "react-dom/client";

import { NAV } from "../../_shared/nav-meta";
import { About, Home, User } from "../../_shared/pages";

import type { Route } from "@real-router/core";
import type { StandardSchemaV1 } from "@real-router/search-schema-plugin";
import type { JSX } from "react";

// Minimal hand-rolled Standard Schema V1 (the plugin's inline interface —
// no zod dependency): accepts an optional string `tab`. The per-nav cost this
// variant measures is the plugin's validation plumbing, not a heavy validator.
const aboutSearchSchema: StandardSchemaV1<
  Record<string, unknown>,
  { tab?: string }
> = {
  "~standard": {
    version: 1,
    vendor: "bench",
    validate: (value) => {
      const tab = (value as Record<string, unknown>).tab;

      if (tab !== undefined && typeof tab !== "string") {
        return { issues: [{ message: "tab must be a string" }] };
      }

      return { value: value as { tab?: string } };
    },
  },
};

// Same routes as the bare real-router variant, plus the schema-carrying query
// declaration on `about` (nav-latency's home↔about loop exercises validation).
const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about?tab", searchSchema: aboutSearchSchema },
  { name: "user", path: "/users/:id" },
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

// The realistic production stack the bare cell omits (interceptor-depth note):
// per-nav interceptor chains become forwardState=2 / buildPath=1, plus the
// ssr-data leave-listener on every navigation and persistent-param merging.
router.usePlugin(
  browserPluginFactory(),
  persistentParamsPluginFactory({ locale: "en" }),
  searchSchemaPlugin({ mode: "production" }),
  ssrDataPluginFactory({
    // One route-level loader so the plugin is realistically configured; it
    // resolves synchronously and only runs on start()/invalidate — client
    // navigations pay the listener plumbing, not the loader.
    about: () => () => ({ loaded: true }),
  }),
);

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
