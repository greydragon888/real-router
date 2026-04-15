import { useStore } from "@nanostores/vue";
import { createRouter } from "@real-router/core";
import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";
import { memoryPluginFactory } from "@real-router/memory-plugin";
import { searchSchemaPlugin } from "@real-router/search-schema-plugin";
import {
  RouterProvider,
  RouteView,
  Link,
  useRoute,
  useRouteNode,
} from "@real-router/vue";
import { atom, computed } from "nanostores";
import { createApp, defineComponent, h } from "vue";
import { z } from "zod";

import {
  runPerfSelectorComputation,
  normalizePage,
  noop,
} from "../../perf-utils";

import type { Route } from "@real-router/core";

const searchSchema = z.object({
  page: z.number().int().positive(),
  filter: z.string().min(1),
});

const routes: Route[] = [
  {
    name: "items",
    path: "/items/:id",
    decodeParams: (p) => ({ ...p, id: normalizePage(p.id) }),
    encodeParams: (p) => ({ ...p, id: `${p.id}` }),
    onEnter: () => noop,
    onStay: () => noop,
    onLeave: () => noop,
    children: [{ name: "details", path: "/details" }],
  },
  {
    name: "search",
    path: "/search?page&filter",
    defaultParams: { page: 1, filter: "all" },
    searchSchema,
  },
  {
    name: "ctx",
    path: "/ctx/:id",
    decodeParams: (p) => ({ ...p, id: normalizePage(p.id) }),
    encodeParams: (p) => ({ ...p, id: `${p.id}` }),
  },
];

const $searchParams = atom<{ page: number; filter: string }>({
  page: 1,
  filter: "all",
});

const $loaderDeps = computed($searchParams, (p) => ({
  page: p.page,
  filter: p.filter,
}));

const $loaderData = computed($loaderDeps, (d) => ({
  seed: d.page * 31 + d.filter.length,
  checksum: d.page * 17 + d.filter.length,
}));

function createAppRouter() {
  const r = createRouter(routes, {
    defaultRoute: "search",
    queryParams: { numberFormat: "auto" },
    limits: { maxListeners: 0, warnListeners: 0 },
  });

  r.usePlugin(
    memoryPluginFactory(),
    searchSchemaPlugin({ mode: "production" }),
    lifecyclePluginFactory(),
  );

  r.subscribe(({ route }) => {
    if (route.name === "search") {
      $searchParams.set({
        page: route.params.page as number,
        filter: route.params.filter as string,
      });
    }
  });

  return r;
}

const rootSelectors = Array.from({ length: 10 }, (_, i) => i);
const routeSelectors = Array.from({ length: 6 }, (_, i) => i);
const linkGroups = Array.from({ length: 4 }, (_, i) => i);

const RootParamsSubscriber = defineComponent({
  props: { index: { type: Number, required: true } },
  setup(props) {
    const { route } = useRoute();

    return () => {
      const id = Number(route.value?.params.id ?? 0);

      void runPerfSelectorComputation(
        runPerfSelectorComputation(id + props.index),
      );

      return null;
    };
  },
});

const RootSearchSubscriber = defineComponent({
  props: { index: { type: Number, required: true } },
  setup(props) {
    const { route } = useRoute();

    return () => {
      const page = Number(route.value?.params.page ?? 0);

      void runPerfSelectorComputation(
        runPerfSelectorComputation(page + props.index),
      );

      return null;
    };
  },
});

const ItemParamsSubscriber = defineComponent({
  props: { index: { type: Number, required: true } },
  setup(props) {
    const { route } = useRouteNode("items");

    return () => {
      const id = Number(route.value?.params.id ?? 0);

      void runPerfSelectorComputation(
        runPerfSelectorComputation(id + props.index),
      );

      return null;
    };
  },
});

const SearchStateSubscriber = defineComponent({
  props: { index: { type: Number, required: true } },
  setup(props) {
    const { route } = useRouteNode("search");

    return () => {
      const page = Number(route.value?.params.page ?? 0);
      const filter = String(route.value?.params.filter ?? "");

      void runPerfSelectorComputation(
        runPerfSelectorComputation(page + filter.length + props.index),
      );

      return null;
    };
  },
});

const SearchLoaderDepsSubscriber = defineComponent({
  props: { index: { type: Number, required: true } },
  setup(props) {
    const deps = useStore($loaderDeps);

    return () => {
      void runPerfSelectorComputation(
        runPerfSelectorComputation(
          deps.value.page + deps.value.filter.length + props.index,
        ),
      );

      return null;
    };
  },
});

const SearchLoaderDataSubscriber = defineComponent({
  props: { index: { type: Number, required: true } },
  setup(props) {
    const data = useStore($loaderData);

    return () => {
      void runPerfSelectorComputation(
        runPerfSelectorComputation(
          data.value.seed + data.value.checksum + props.index,
        ),
      );

      return null;
    };
  },
});

const ContextParamsSubscriber = defineComponent({
  props: { index: { type: Number, required: true } },
  setup(props) {
    const { route } = useRouteNode("ctx");

    return () => {
      const id = Number(route.value?.params.id ?? 0);

      void runPerfSelectorComputation(
        runPerfSelectorComputation(id + props.index),
      );

      return null;
    };
  },
});

const ContextRouteSubscriber = defineComponent({
  props: { index: { type: Number, required: true } },
  setup(props) {
    const { route } = useRouteNode("ctx");

    return () => {
      const sectionSeed = Number(route.value?.params.id ?? 0) * 13 + 1;

      void runPerfSelectorComputation(
        runPerfSelectorComputation(sectionSeed + props.index),
      );

      return null;
    };
  },
});

const RootSubscribers = defineComponent({
  setup() {
    return () => [
      ...rootSelectors.map((i) =>
        h(RootParamsSubscriber, { key: `p${i}`, index: i }),
      ),
      ...rootSelectors.map((i) =>
        h(RootSearchSubscriber, { key: `s${i}`, index: i }),
      ),
    ];
  },
});

const LinkPanel = defineComponent({
  setup() {
    const { route } = useRoute();

    return () =>
      h(
        "div",
        { "data-testid": "link-panel" },
        linkGroups.map((groupIndex) => {
          const itemsId = groupIndex === 0 ? 1 : groupIndex + 2;
          const ctxId = groupIndex + 1;
          const r = route.value;

          return h("div", { key: groupIndex }, [
            h(
              Link,
              {
                routeName: "items",
                routeParams: { id: itemsId },
                "data-testid": groupIndex === 0 ? "go-items-1" : undefined,
                activeClassName: "active-link",
              },
              { default: () => `Items ${itemsId}` },
            ),
            h(
              Link,
              {
                routeName: "items",
                routeParams: { id: 2 },
                "data-testid": groupIndex === 0 ? "go-items-2" : undefined,
                activeClassName: "active-link",
              },
              { default: () => `Items 2 alt ${groupIndex}` },
            ),
            h(
              Link,
              {
                routeName: "search",
                routeParams: { page: 1, filter: "all" },
                "data-testid": groupIndex === 0 ? "go-search" : undefined,
                activeClassName: "active-link",
              },
              { default: () => `Search ${groupIndex}` },
            ),
            h(
              Link,
              {
                routeName: "ctx",
                routeParams: { id: ctxId },
                "data-testid": groupIndex === 0 ? "go-ctx" : undefined,
                activeClassName: "active-link",
              },
              { default: () => `Context ${ctxId}` },
            ),
            h(
              Link,
              {
                routeName: "search",
                routeParams: {
                  page:
                    (r?.name === "search" ? Number(r.params.page ?? 0) : 0) +
                    groupIndex +
                    1,
                  filter:
                    r?.name === "search"
                      ? String(r.params.filter ?? "all")
                      : "all",
                },
                "data-testid":
                  groupIndex === 0 ? "search-next-page" : undefined,
                activeClassName: "active-link",
              },
              { default: () => `Search +${groupIndex + 1}` },
            ),
          ]);
        }),
      );
  },
});

const ItemDetailsPage = defineComponent({
  setup() {
    return () =>
      routeSelectors.map((i) => h(ItemParamsSubscriber, { key: i, index: i }));
  },
});

const ItemsPage = defineComponent({
  setup() {
    const { route } = useRouteNode("items");

    return () => {
      const id = route.value?.params.id;

      return [
        ...routeSelectors.map((i) =>
          h(ItemParamsSubscriber, { key: i, index: i }),
        ),
        h(
          Link,
          {
            routeName: "items.details",
            routeParams: { id },
            "data-testid": "items-details",
          },
          { default: () => "Details" },
        ),
        h(
          Link,
          {
            routeName: "items",
            routeParams: { id },
            "data-testid": "items-parent",
          },
          { default: () => "Parent" },
        ),
        h(
          RouteView,
          { nodeName: "items" },
          {
            default: () => [
              h(
                RouteView.Match,
                { segment: "details" },
                { default: () => h(ItemDetailsPage) },
              ),
            ],
          },
        ),
      ];
    };
  },
});

const SearchPage = defineComponent({
  setup() {
    return () => [
      ...routeSelectors.map((i) =>
        h(SearchStateSubscriber, { key: i, index: i }),
      ),
      ...routeSelectors.map((i) =>
        h(SearchLoaderDepsSubscriber, { key: i, index: i }),
      ),
      ...routeSelectors.map((i) =>
        h(SearchLoaderDataSubscriber, { key: i, index: i }),
      ),
    ];
  },
});

const ContextPage = defineComponent({
  setup() {
    return () => [
      ...routeSelectors.map((i) =>
        h(ContextParamsSubscriber, { key: i, index: i }),
      ),
      ...routeSelectors.map((i) =>
        h(ContextRouteSubscriber, { key: i, index: i }),
      ),
    ];
  },
});

function createAppComponent(appRouter: ReturnType<typeof createAppRouter>) {
  return defineComponent({
    setup() {
      return () =>
        h(
          RouterProvider,
          { router: appRouter },
          {
            default: () => [
              h(RootSubscribers),
              h(LinkPanel),
              h(
                RouteView,
                { nodeName: "" },
                {
                  default: () => [
                    h(
                      RouteView.Match,
                      { segment: "items" },
                      { default: () => h(ItemsPage) },
                    ),
                    h(
                      RouteView.Match,
                      { segment: "search" },
                      { default: () => h(SearchPage) },
                    ),
                    h(
                      RouteView.Match,
                      { segment: "ctx" },
                      { default: () => h(ContextPage) },
                    ),
                  ],
                },
              ),
            ],
          },
        );
    },
  });
}

export function mountTestApp(container: HTMLElement) {
  const router = createAppRouter();
  const app = createApp(createAppComponent(router));

  app.mount(container);

  return {
    router,
    unmount() {
      app.unmount();
      router.stop();
    },
  };
}
