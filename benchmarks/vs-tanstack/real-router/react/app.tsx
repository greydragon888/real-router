import { useStore } from "@nanostores/react";
import { createRouter } from "@real-router/core";
import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";
import { memoryPluginFactory } from "@real-router/memory-plugin";
import {
  RouterProvider,
  RouteView,
  Link,
  useRoute,
  useRouteNode,
} from "@real-router/react";
import { searchSchemaPlugin } from "@real-router/search-schema-plugin";
import { atom, computed } from "nanostores";
import { createRoot } from "react-dom/client";
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
    children: [
      {
        name: "details",
        path: "/details",
      },
    ],
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

function RootParamsSubscriber({ index }: { index: number }) {
  const { route } = useRoute();
  const id = Number(route?.params.id ?? 0);

  void runPerfSelectorComputation(runPerfSelectorComputation(id + index));

  return null;
}

function RootSearchSubscriber({ index }: { index: number }) {
  const { route } = useRoute();
  const page = Number(route?.params.page ?? 0);

  void runPerfSelectorComputation(runPerfSelectorComputation(page + index));

  return null;
}

function ItemParamsSubscriber({ index }: { index: number }) {
  const { route } = useRouteNode("items");
  const id = Number(route?.params.id ?? 0);

  void runPerfSelectorComputation(runPerfSelectorComputation(id + index));

  return null;
}

function SearchStateSubscriber({ index }: { index: number }) {
  const { route } = useRouteNode("search");
  const page = Number(route?.params.page ?? 0);
  const filter = String(route?.params.filter ?? "");

  void runPerfSelectorComputation(
    runPerfSelectorComputation(page + filter.length + index),
  );

  return null;
}

function SearchLoaderDepsSubscriber({ index }: { index: number }) {
  const deps = useStore($loaderDeps);

  void runPerfSelectorComputation(
    runPerfSelectorComputation(deps.page + deps.filter.length + index),
  );

  return null;
}

function SearchLoaderDataSubscriber({ index }: { index: number }) {
  const data = useStore($loaderData);

  void runPerfSelectorComputation(
    runPerfSelectorComputation(data.seed + data.checksum + index),
  );

  return null;
}

function ContextParamsSubscriber({ index }: { index: number }) {
  const { route } = useRouteNode("ctx");
  const id = Number(route?.params.id ?? 0);

  void runPerfSelectorComputation(runPerfSelectorComputation(id + index));

  return null;
}

function ContextRouteSubscriber({ index }: { index: number }) {
  const { route } = useRouteNode("ctx");
  const sectionSeed = Number(route?.params.id ?? 0) * 13 + 1;

  void runPerfSelectorComputation(
    runPerfSelectorComputation(sectionSeed + index),
  );

  return null;
}

function RootSubscribers() {
  return (
    <>
      {rootSelectors.map((i) => (
        <RootParamsSubscriber key={`p${i}`} index={i} />
      ))}
      {rootSelectors.map((i) => (
        <RootSearchSubscriber key={`s${i}`} index={i} />
      ))}
    </>
  );
}

function LinkPanel() {
  const { route } = useRoute();

  return (
    <div data-testid="link-panel">
      {linkGroups.map((groupIndex) => {
        const itemsId = groupIndex === 0 ? 1 : groupIndex + 2;
        const ctxId = groupIndex + 1;

        return (
          <div key={groupIndex}>
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
                  (route?.name === "search"
                    ? Number(route.params.page ?? 0)
                    : 0) +
                  groupIndex +
                  1,
                filter:
                  route?.name === "search"
                    ? String(route.params.filter ?? "all")
                    : "all",
              }}
              data-testid={groupIndex === 0 ? "search-next-page" : undefined}
              activeClassName="active-link"
            >
              Search +{groupIndex + 1}
            </Link>
          </div>
        );
      })}
    </div>
  );
}

function ItemsPage() {
  const { route } = useRouteNode("items");
  const id = route?.params.id;

  return (
    <>
      {routeSelectors.map((i) => (
        <ItemParamsSubscriber key={i} index={i} />
      ))}
      <Link
        routeName="items.details"
        routeParams={{ id }}
        data-testid="items-details"
      >
        Details
      </Link>
      <Link routeName="items" routeParams={{ id }} data-testid="items-parent">
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
    <>
      {routeSelectors.map((i) => (
        <ItemParamsSubscriber key={i} index={i} />
      ))}
    </>
  );
}

function SearchPage() {
  return (
    <>
      {routeSelectors.map((i) => (
        <SearchStateSubscriber key={i} index={i} />
      ))}
      {routeSelectors.map((i) => (
        <SearchLoaderDepsSubscriber key={i} index={i} />
      ))}
      {routeSelectors.map((i) => (
        <SearchLoaderDataSubscriber key={i} index={i} />
      ))}
    </>
  );
}

function ContextPage() {
  return (
    <>
      {routeSelectors.map((i) => (
        <ContextParamsSubscriber key={i} index={i} />
      ))}
      {routeSelectors.map((i) => (
        <ContextRouteSubscriber key={i} index={i} />
      ))}
    </>
  );
}

function App({ appRouter }: { appRouter: ReturnType<typeof createAppRouter> }) {
  return (
    <RouterProvider router={appRouter}>
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
  const reactRoot = createRoot(container);

  reactRoot.render(<App appRouter={router} />);

  return {
    router,
    unmount() {
      reactRoot.unmount();
      router.stop();
    },
  };
}
