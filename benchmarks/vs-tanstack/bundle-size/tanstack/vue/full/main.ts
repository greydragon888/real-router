import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useParams,
} from "@tanstack/vue-router";
import { createApp, defineComponent, h } from "vue";

const RootComponent = defineComponent({
  setup() {
    return () => [
      h(
        Link,
        {
          to: "/items/$id",
          params: { id: "1" },
          activeProps: { class: "active" },
        },
        { default: () => "items" },
      ),
      h(Outlet),
    ];
  },
});

const rootRoute = createRootRoute({ component: RootComponent });

const ItemsComponent = defineComponent({
  setup() {
    const params = useParams({ from: "/items/$id" });
    const navigate = useNavigate();
    const data = itemsRoute.useLoaderData();

    return () =>
      h("div", { onClick: () => void navigate({ to: "/" }) }, [
        h(
          Link,
          { from: itemsRoute.fullPath, to: "./details" },
          { default: () => `details:${params.value.id}:${data.value.id}` },
        ),
        h(Outlet),
      ]);
  },
});

const itemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/items/$id",
  loader: ({ params }) => ({ id: params.id }),
  component: ItemsComponent,
});

const detailsRoute = createRoute({
  getParentRoute: () => itemsRoute,
  path: "details",
  component: defineComponent({
    setup() {
      return () => h("div", "details");
    },
  }),
});

const router = createRouter({
  history: createMemoryHistory({ initialEntries: ["/"] }),
  routeTree: rootRoute.addChildren([itemsRoute.addChildren([detailsRoute])]),
});

const App = defineComponent({
  setup() {
    return () => h(RouterProvider, { router });
  },
});

createApp(App).mount("#root");
