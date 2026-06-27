import { createRouter } from "@real-router/core";
import {
  RouterProvider,
  RouteView,
  Link,
  useRoute,
  useRouteNode,
  useNavigator,
} from "@real-router/solid";
import { render } from "solid-js/web";

import type { Route } from "@real-router/core";

// "full" exercises a broad surface of the adapter + plugins so the bundle
// reflects an app that uses Link / RouteView / hooks / plugins, not just the
// minimal mount. Solid hooks return accessors — call them to read the value.
const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "items",
    path: "/items/:id",
    children: [{ name: "details", path: "/details" }],
  },
];

const router = createRouter(routes, { defaultRoute: "home" });

function HomePage() {
  const routeState = useRoute();

  return <div>{`home:${routeState().route.name}`}</div>;
}

function ItemsPage() {
  const routeState = useRouteNode("items");
  const navigator = useNavigator();

  return (
    <div onClick={() => void navigator.navigate("home")}>
      <Link
        routeName="items.details"
        routeParams={{ id: routeState().route?.params.id }}
      >
        details
      </Link>
      <RouteView nodeName="items">
        <RouteView.Match segment="details">
          <div>details</div>
        </RouteView.Match>
      </RouteView>
    </div>
  );
}

function App() {
  return (
    <RouterProvider router={router}>
      <Link routeName="items" routeParams={{ id: 1 }} activeClassName="active">
        items
      </Link>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <HomePage />
        </RouteView.Match>
        <RouteView.Match segment="items">
          <ItemsPage />
        </RouteView.Match>
      </RouteView>
    </RouterProvider>
  );
}

async function main() {
  await router.start("/");

  render(() => <App />, document.querySelector("#root")!);
}

void main();
