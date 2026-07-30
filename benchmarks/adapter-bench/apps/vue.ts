/**
 * Vue adapter-bench app — mirrors apps/react.tsx, written with `h()` render
 * functions (no SFC → no vue plugin needed; same idiom as the adapter's own
 * tests).
 * Commit mechanics: Vue flushes its scheduler on the microtask queue and has
 * no public flushSync — commits settle via `await nextTick()`, so the Vue
 * bench bodies are async (batchedAsync).
 */
import { createRouter } from "@real-router/core";
import { memoryPluginFactory } from "@real-router/memory-plugin";
import {
  Link,
  RouterProvider,
  RouteView,
  useRoute,
  useRouteNode,
} from "@real-router/vue";
import { createApp, defineComponent, h, nextTick, Fragment } from "vue";

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

const RootSubscriber = defineComponent({
  props: { index: { type: Number, required: true } },
  setup(props) {
    const { route } = useRoute();

    return () =>
      h(
        "span",
        { "data-i": props.index, "data-route": route.value?.name ?? "" },
        String(props.index),
      );
  },
});

const ItemsSubscriber = defineComponent({
  props: { index: { type: Number, required: true } },
  setup(props) {
    const { route } = useRouteNode("items");

    return () =>
      h(
        "span",
        {
          "data-i": props.index,
          "data-id": String(route.value?.params.id ?? ""),
        },
        String(props.index),
      );
  },
});

const LinkPanel = defineComponent({
  setup() {
    return () =>
      h("nav", [
        ...indices.map((i) =>
          h(
            Link,
            {
              key: `it${String(i)}`,
              routeName: "items",
              routeParams: { id: String(i + 1) },
              activeClassName: "active",
            },
            { default: () => `Items ${String(i + 1)}` },
          ),
        ),
        h(
          Link,
          { routeName: "home", activeClassName: "active" },
          { default: () => "Home" },
        ),
        h(
          Link,
          { routeName: "about", activeClassName: "active" },
          { default: () => "About" },
        ),
        h(
          Link,
          {
            routeName: "items.details",
            routeParams: { id: "1" },
            activeClassName: "active",
          },
          { default: () => "Details 1" },
        ),
        // routeSearch active-recompute panel (RFC-4 M2 / #1548): 5 tab Links on
        // the same route, distinguished ONLY by query; ignoreQueryParams=false →
        // a query-only swap recomputes active for all five.
        ...indices.map((i) =>
          h(
            Link,
            {
              key: `tab${String(i)}`,
              routeName: "search",
              routeSearch: { tab: `t${String(i)}` },
              ignoreQueryParams: false,
              activeClassName: "active",
            },
            { default: () => `Tab ${String(i)}` },
          ),
        ),
      ]);
  },
});

const ItemsPage = defineComponent({
  setup() {
    return () =>
      h(Fragment, [
        ...indices.map((i) => h(ItemsSubscriber, { key: i, index: i })),
        h(
          RouteView,
          { nodeName: "items" },
          {
            details: () => h("p", "details"),
          },
        ),
      ]);
  },
});

const App = defineComponent({
  setup() {
    const { route } = useRoute();

    return () =>
      h(Fragment, [
        ...indices.map((i) => h(RootSubscriber, { key: i, index: i })),
        h(LinkPanel),
        route.value?.name.startsWith("items")
          ? h(ItemsPage)
          : h("p", route.value?.name ?? ""),
      ]);
  },
});

export async function mountTestApp(
  container: HTMLElement,
  startPath: string,
): Promise<MountedApp> {
  const router = createRouter(routes);

  router.usePlugin(memoryPluginFactory());
  await router.start(startPath);

  const app = createApp(
    defineComponent({
      setup() {
        return () =>
          h(RouterProvider, { router }, { default: () => h(App) });
      },
    }),
  );

  app.mount(container);

  return {
    commitNavigate: async (name, params, search) => {
      void router.navigate(name, params, search);
      await nextTick();
    },
    commitHistory: async (dir) => {
      if (dir === "back") {
        router.back();
      } else {
        router.forward();
      }
      await nextTick();
    },
    unmount: () => {
      app.unmount();
    },
  };
}
