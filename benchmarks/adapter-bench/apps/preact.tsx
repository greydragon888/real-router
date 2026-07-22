/** @jsxImportSource preact */
/**
 * Preact adapter-bench app — mirrors apps/react.tsx.
 * Commit mechanics: Preact has no flushSync; `options.debounceRendering`
 * is overridden to run re-renders SYNCHRONOUSLY (the canonical Preact
 * trick), so a plain navigate commits inline. The override lives inside
 * this bundle's own Preact copy — no cross-suite contamination.
 */
import { createRouter } from "@real-router/core";
import { memoryPluginFactory } from "@real-router/memory-plugin";
import {
  Link,
  RouterProvider,
  RouteView,
  useRoute,
  useRouteNode,
} from "@real-router/preact";
import { options, render } from "preact";

import type { MountedApp } from "../shared/bench-utils.mjs";
import type { Route } from "@real-router/core";

// Synchronous rendering: every scheduled re-render flushes inline, and
// effects flush right after render (Preact schedules effect flushes via
// options.requestAnimationFrame — left async, the adapter's subscription
// effect would attach only on a later macrotask and navigations would not
// commit synchronously).
options.debounceRendering = (cb) => {
  cb();
};
options.requestAnimationFrame = (cb) => {
  cb();
};

const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "items",
    path: "/items/:id",
    children: [{ name: "details", path: "/details" }],
  },
  { name: "about", path: "/about" },
  { name: "search", path: "/search?tab" },
];

const indices = [0, 1, 2, 3, 4];

function RootSubscriber({ index }: { index: number }) {
  const { route } = useRoute();

  return (
    <span data-i={index} data-route={route?.name ?? ""}>
      {index}
    </span>
  );
}

function ItemsSubscriber({ index }: { index: number }) {
  const { route } = useRouteNode("items");

  return (
    <span data-i={index} data-id={String(route?.params.id ?? "")}>
      {index}
    </span>
  );
}

function LinkPanel() {
  return (
    <nav>
      {indices.map((i) => (
        <Link
          key={`it${String(i)}`}
          routeName="items"
          routeParams={{ id: String(i + 1) }}
          activeClassName="active"
        >
          Items {i + 1}
        </Link>
      ))}
      <Link routeName="home" activeClassName="active">
        Home
      </Link>
      <Link routeName="about" activeClassName="active">
        About
      </Link>
      <Link
        routeName="items.details"
        routeParams={{ id: "1" }}
        activeClassName="active"
      >
        Details 1
      </Link>
      {/* routeSearch active-recompute panel (RFC-4 M2 / #1548): 5 tab Links on
          the same route, distinguished ONLY by query; ignoreQueryParams=false →
          a query-only swap recomputes active for all five. */}
      {indices.map((i) => (
        <Link
          key={`tab${String(i)}`}
          routeName="search"
          routeSearch={{ tab: `t${String(i)}` }}
          ignoreQueryParams={false}
          activeClassName="active"
        >
          Tab {i}
        </Link>
      ))}
    </nav>
  );
}

function ItemsPage() {
  return (
    <>
      {indices.map((i) => (
        <ItemsSubscriber key={i} index={i} />
      ))}
      <RouteView nodeName="items">
        <RouteView.Match segment="details">
          <p>details</p>
        </RouteView.Match>
      </RouteView>
    </>
  );
}

function App() {
  const { route } = useRoute();

  return (
    <>
      {indices.map((i) => (
        <RootSubscriber key={i} index={i} />
      ))}
      <LinkPanel />
      {route?.name.startsWith("items") ? <ItemsPage /> : <p>{route?.name}</p>}
    </>
  );
}

export async function mountTestApp(
  container: HTMLElement,
  startPath: string,
): Promise<MountedApp> {
  const router = createRouter(routes);

  router.usePlugin(memoryPluginFactory());
  await router.start(startPath);

  render(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
    container,
  );

  return {
    commitNavigate: (name, params, search) => {
      void router.navigate(name, params, search);
    },
    commitHistory: (dir) => {
      if (dir === "back") {
        router.back();
      } else {
        router.forward();
      }
    },
    unmount: () => {
      render(null, container);
    },
  };
}
