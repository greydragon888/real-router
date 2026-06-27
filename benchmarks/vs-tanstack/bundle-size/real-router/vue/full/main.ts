import { createRouter } from "@real-router/core";
import {
  RouterProvider,
  RouteView,
  Link,
  useRoute,
  useRouteNode,
  useNavigator,
} from "@real-router/vue";
import { createApp, defineComponent, h } from "vue";

import type { Route } from "@real-router/core";

// "full" exercises a broad surface of the adapter + plugins so the bundle
// reflects an app that uses Link / RouteView / composables / plugins, not just
// the minimal mount.
const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "items",
    path: "/items/:id",
    children: [{ name: "details", path: "/details" }],
  },
];

const router = createRouter(routes, { defaultRoute: "home" });

const HomePage = defineComponent({
  setup() {
    const { route } = useRoute();

    return () => h("div", `home:${route.value.name}`);
  },
});

const ItemsPage = defineComponent({
  setup() {
    const { route } = useRouteNode("items");
    const navigator = useNavigator();

    return () => {
      const id = route.value?.params.id;

      return h("div", { onClick: () => void navigator.navigate("home") }, [
        h(
          Link,
          { routeName: "items.details", routeParams: { id } },
          { default: () => "details" },
        ),
        h(
          RouteView,
          { nodeName: "items" },
          {
            default: () => [
              h(
                RouteView.Match,
                { segment: "details" },
                { default: () => h("div", "details") },
              ),
            ],
          },
        ),
      ]);
    };
  },
});

const App = defineComponent({
  setup() {
    return () =>
      h(
        RouterProvider,
        { router },
        {
          default: () => [
            h(
              Link,
              {
                routeName: "items",
                routeParams: { id: 1 },
                activeClassName: "active",
              },
              { default: () => "items" },
            ),
            h(
              RouteView,
              { nodeName: "" },
              {
                default: () => [
                  h(
                    RouteView.Match,
                    { segment: "home" },
                    { default: () => h(HomePage) },
                  ),
                  h(
                    RouteView.Match,
                    { segment: "items" },
                    { default: () => h(ItemsPage) },
                  ),
                ],
              },
            ),
          ],
        },
      );
  },
});

async function main() {
  await router.start("/");

  createApp(App).mount("#root");
}

void main();
