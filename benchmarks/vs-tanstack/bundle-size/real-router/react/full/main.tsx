import { createRouter } from "@real-router/core";
import {
  RouterProvider,
  RouteView,
  Link,
  useRoute,
  useRouteNode,
  useNavigator,
} from "@real-router/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { Route } from "@real-router/core";

// "full" exercises a broad surface of the adapter + plugins so the bundle
// reflects an app that uses Link / RouteView / hooks / plugins, not just the
// minimal mount.
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
  const { route } = useRoute();

  return <div>{`home:${route.name}`}</div>;
}

function ItemsPage() {
  const { route } = useRouteNode("items");
  const navigator = useNavigator();
  const id = route?.params.id;

  return (
    <div onClick={() => void navigator.navigate("home")}>
      <Link routeName="items.details" routeParams={{ id }}>
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

  createRoot(document.querySelector("#root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void main();
