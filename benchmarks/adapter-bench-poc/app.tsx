/**
 * PoC adapter-bench app — React + @real-router/react + memory-plugin.
 *
 * Deliberately minimal (no nanostores/zod/search-schema of the retired
 * vs-tanstack app): the subject is the ADAPTER's per-navigation work —
 * useSyncExternalStore fan-out, <Link> active-class recompute, RouteView
 * subtree swap — not app-land selector churn.
 *
 * Built by vite (see vite.config.mts) into dist/app.mjs with react-dom
 * bundled in production mode; the bench process imports `mountTestApp` after
 * installing the jsdom globals (jsdom-env.mts).
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
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

import type { Route, Router } from "@real-router/core";

const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "items",
    path: "/items/:id",
    children: [{ name: "details", path: "/details" }],
  },
  { name: "about", path: "/about" },
];

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

const indices = [0, 1, 2, 3, 4];

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

export interface MountResult {
  router: Router;
  unmount: () => void;
}

/** Mounts the app synchronously (flushSync) and resolves after start(). */
export async function mountTestApp(
  container: HTMLElement,
  startPath: string,
): Promise<MountResult> {
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
    router,
    unmount: () => {
      root.unmount();
    },
  };
}

export { flushSync };
