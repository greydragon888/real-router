import { useStore } from "@nanostores/solid";
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
} from "@real-router/solid";
import { atom, computed } from "nanostores";
import { createRenderEffect, For } from "solid-js";
import { render } from "solid-js/web";
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
    onEnter: noop,
    onStay: noop,
    onLeave: noop,
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

function RootParamsSubscriber(props: { index: number }) {
  const routeState = useRoute();

  createRenderEffect(() => {
    const id = Number(routeState().route?.params.id ?? 0);

    void runPerfSelectorComputation(
      runPerfSelectorComputation(id + props.index),
    );
  });

  return null;
}

function RootSearchSubscriber(props: { index: number }) {
  const routeState = useRoute();

  createRenderEffect(() => {
    const page = Number(routeState().route?.params.page ?? 0);

    void runPerfSelectorComputation(
      runPerfSelectorComputation(page + props.index),
    );
  });

  return null;
}

function ItemParamsSubscriber(props: { index: number }) {
  const routeState = useRouteNode("items");

  createRenderEffect(() => {
    const id = Number(routeState().route?.params.id ?? 0);

    void runPerfSelectorComputation(
      runPerfSelectorComputation(id + props.index),
    );
  });

  return null;
}

function SearchStateSubscriber(props: { index: number }) {
  const routeState = useRouteNode("search");

  createRenderEffect(() => {
    const page = Number(routeState().route?.params.page ?? 0);
    const filter = String(routeState().route?.params.filter ?? "");

    void runPerfSelectorComputation(
      runPerfSelectorComputation(page + filter.length + props.index),
    );
  });

  return null;
}

function SearchLoaderDepsSubscriber(props: { index: number }) {
  const deps = useStore($loaderDeps);

  createRenderEffect(() => {
    void runPerfSelectorComputation(
      runPerfSelectorComputation(
        deps().page + deps().filter.length + props.index,
      ),
    );
  });

  return null;
}

function SearchLoaderDataSubscriber(props: { index: number }) {
  const data = useStore($loaderData);

  createRenderEffect(() => {
    void runPerfSelectorComputation(
      runPerfSelectorComputation(data().seed + data().checksum + props.index),
    );
  });

  return null;
}

function ContextParamsSubscriber(props: { index: number }) {
  const routeState = useRouteNode("ctx");

  createRenderEffect(() => {
    const id = Number(routeState().route?.params.id ?? 0);

    void runPerfSelectorComputation(
      runPerfSelectorComputation(id + props.index),
    );
  });

  return null;
}

function ContextRouteSubscriber(props: { index: number }) {
  const routeState = useRouteNode("ctx");

  createRenderEffect(() => {
    const sectionSeed = Number(routeState().route?.params.id ?? 0) * 13 + 1;

    void runPerfSelectorComputation(
      runPerfSelectorComputation(sectionSeed + props.index),
    );
  });

  return null;
}

function RootSubscribers() {
  return (
    <>
      <For each={rootSelectors}>
        {(i) => <RootParamsSubscriber index={i} />}
      </For>
      <For each={rootSelectors}>
        {(i) => <RootSearchSubscriber index={i} />}
      </For>
    </>
  );
}

function LinkPanel() {
  const routeState = useRoute();

  return (
    <div data-testid="link-panel">
      <For each={linkGroups}>
        {(groupIndex) => {
          const itemsId = groupIndex === 0 ? 1 : groupIndex + 2;
          const ctxId = groupIndex + 1;

          return (
            <div>
              <Link
                routeName="items"
                routeParams={{ id: itemsId }}
                data-testid={groupIndex === 0 ? "go-items-1" : undefined}
                activeClassName="active-link"
              >
                Items {itemsId}
              </Link>
              <Link
                routeName="items"
                routeParams={{ id: 2 }}
                data-testid={groupIndex === 0 ? "go-items-2" : undefined}
                activeClassName="active-link"
              >
                Items 2 alt {groupIndex}
              </Link>
              <Link
                routeName="search"
                routeParams={{ page: 1, filter: "all" }}
                data-testid={groupIndex === 0 ? "go-search" : undefined}
                activeClassName="active-link"
              >
                Search {groupIndex}
              </Link>
              <Link
                routeName="ctx"
                routeParams={{ id: ctxId }}
                data-testid={groupIndex === 0 ? "go-ctx" : undefined}
                activeClassName="active-link"
              >
                Context {ctxId}
              </Link>
              <Link
                routeName="search"
                routeParams={{
                  page:
                    (() => {
                      const r = routeState().route;

                      return r?.name === "search"
                        ? Number(r.params.page ?? 0)
                        : 0;
                    })() +
                    groupIndex +
                    1,
                  filter: (() => {
                    const r = routeState().route;

                    return r?.name === "search"
                      ? String(r.params.filter ?? "all")
                      : "all";
                  })(),
                }}
                data-testid={groupIndex === 0 ? "search-next-page" : undefined}
                activeClassName="active-link"
              >
                Search +{groupIndex + 1}
              </Link>
            </div>
          );
        }}
      </For>
    </div>
  );
}

function ItemsPage() {
  const routeState = useRouteNode("items");

  return (
    <>
      <For each={routeSelectors}>
        {(i) => <ItemParamsSubscriber index={i} />}
      </For>
      <Link
        routeName="items.details"
        routeParams={{ id: routeState().route?.params.id }}
        data-testid="items-details"
      >
        Details
      </Link>
      <Link
        routeName="items"
        routeParams={{ id: routeState().route?.params.id }}
        data-testid="items-parent"
      >
        Parent
      </Link>
      <RouteView nodeName="items">
        <RouteView.Match segment="details">
          <ItemDetailsPage />
        </RouteView.Match>
      </RouteView>
    </>
  );
}

function ItemDetailsPage() {
  return (
    <For each={routeSelectors}>{(i) => <ItemParamsSubscriber index={i} />}</For>
  );
}

function SearchPage() {
  return (
    <>
      <For each={routeSelectors}>
        {(i) => <SearchStateSubscriber index={i} />}
      </For>
      <For each={routeSelectors}>
        {(i) => <SearchLoaderDepsSubscriber index={i} />}
      </For>
      <For each={routeSelectors}>
        {(i) => <SearchLoaderDataSubscriber index={i} />}
      </For>
    </>
  );
}

function ContextPage() {
  return (
    <>
      <For each={routeSelectors}>
        {(i) => <ContextParamsSubscriber index={i} />}
      </For>
      <For each={routeSelectors}>
        {(i) => <ContextRouteSubscriber index={i} />}
      </For>
    </>
  );
}

function App(props: { appRouter: ReturnType<typeof createAppRouter> }) {
  return (
    <RouterProvider router={props.appRouter}>
      <RootSubscribers />
      <LinkPanel />
      <RouteView nodeName="">
        <RouteView.Match segment="items">
          <ItemsPage />
        </RouteView.Match>
        <RouteView.Match segment="search">
          <SearchPage />
        </RouteView.Match>
        <RouteView.Match segment="ctx">
          <ContextPage />
        </RouteView.Match>
      </RouteView>
    </RouterProvider>
  );
}

export function mountTestApp(container: HTMLElement) {
  const router = createAppRouter();
  const dispose = render(() => <App appRouter={router} />, container);

  return {
    router,
    unmount() {
      dispose();
      router.stop();
    },
  };
}
