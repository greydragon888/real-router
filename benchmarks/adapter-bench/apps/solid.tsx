/** @jsxImportSource solid-js */
/**
 * Solid adapter-bench app — mirrors apps/react.tsx.
 * Commit mechanics: none needed — Solid's signal graph propagates
 * synchronously, so a plain navigate commits DOM updates inline.
 * NB: useRoute()/useRouteNode() return Accessors (not objects).
 */
import { createRouter } from "@real-router/core";
import { memoryPluginFactory } from "@real-router/memory-plugin";
import {
  Link,
  RouterProvider,
  RouteView,
  useRoute,
  useRouteNode,
} from "@real-router/solid";
import { For, Show } from "solid-js";
import { render } from "solid-js/web";

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
];

const indices = [0, 1, 2, 3, 4];

function RootSubscriber(props: { index: number }) {
  const state = useRoute();

  return (
    <span data-i={props.index} data-route={state().route.name}>
      {props.index}
    </span>
  );
}

function ItemsSubscriber(props: { index: number }) {
  const state = useRouteNode("items");

  return (
    <span
      data-i={props.index}
      data-id={String(state().route?.params.id ?? "")}
    >
      {props.index}
    </span>
  );
}

function LinkPanel() {
  return (
    <nav>
      <For each={indices}>
        {(i) => (
          <Link
            routeName="items"
            routeParams={{ id: String(i + 1) }}
            activeClassName="active"
          >
            Items {i + 1}
          </Link>
        )}
      </For>
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
      <For each={indices}>{(i) => <ItemsSubscriber index={i} />}</For>
      <RouteView nodeName="items">
        <RouteView.Match segment="details">
          <p>details</p>
        </RouteView.Match>
      </RouteView>
    </>
  );
}

function App() {
  const state = useRoute();

  return (
    <>
      <For each={indices}>{(i) => <RootSubscriber index={i} />}</For>
      <LinkPanel />
      <Show
        when={state().route.name.startsWith("items")}
        fallback={<p>{state().route.name}</p>}
      >
        <ItemsPage />
      </Show>
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

  const dispose = render(
    () => (
      <RouterProvider router={router}>
        <App />
      </RouterProvider>
    ),
    container,
  );

  return {
    commitNavigate: (name, params) => {
      void router.navigate(name, params);
    },
    commitHistory: (dir) => {
      if (dir === "back") {
        router.back();
      } else {
        router.forward();
      }
    },
    unmount: dispose,
  };
}
