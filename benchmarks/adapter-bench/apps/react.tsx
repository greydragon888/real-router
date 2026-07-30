/**
 * React adapter-bench app. Subject: per-navigation adapter work — uSES
 * fan-out, <Link> active-class recompute, RouteView subtree swap.
 * Commit mechanics: `flushSync` wraps each navigation so the synchronous
 * React commit lands inside the measure window.
 */
import { createRouter } from "@real-router/core";
import { memoryPluginFactory } from "@real-router/memory-plugin";
import {
  Link,
  RouterProvider,
  RouteView,
  useRoute,
  useRouteNode,
} from "@real-router/react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import type { MountedApp } from "../shared/bench-utils.mjs";
import type { Route } from "@real-router/core";

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

/** 5 useRoute subscribers — the uSES fan-out every mounted component pays. */
function RootSubscriber({ index }: { index: number }) {
  const { route } = useRoute();

  return (
    <span data-i={index} data-route={route?.name ?? ""}>
      {index}
    </span>
  );
}

/** 5 node-scoped subscribers — shouldUpdateNode-gated re-render path. */
function ItemsSubscriber({ index }: { index: number }) {
  const { route } = useRouteNode("items");

  return (
    <span data-i={index} data-id={String(route?.params.id ?? "")}>
      {index}
    </span>
  );
}

/** 8 Links with activeClassName — per-navigation href/active recompute. */
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
          the same route, distinguished ONLY by their query. `ignoreQueryParams`
          false → each is active for exactly one `?tab=tN`, so a query-only swap
          recomputes active for all five (slow-path createActiveRouteSource). */}
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

  const root = createRoot(container);

  flushSync(() => {
    root.render(
      <RouterProvider router={router}>
        <App />
      </RouterProvider>,
    );
  });

  return {
    commitNavigate: (name, params, search) => {
      flushSync(() => {
        void router.navigate(name, params, search);
      });
    },
    commitHistory: (dir) => {
      flushSync(() => {
        if (dir === "back") {
          router.back();
        } else {
          router.forward();
        }
      });
    },
    unmount: () => {
      root.unmount();
    },
  };
}
