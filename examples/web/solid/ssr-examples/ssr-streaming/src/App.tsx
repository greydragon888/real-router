import { UNKNOWN_ROUTE } from "@real-router/core";
import { Link, RouteView, useRoute } from "@real-router/solid";
import { Show } from "solid-js";

import { ProductDetail } from "./components/ProductDetail";
import { ProductsList } from "./components/ProductsList";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";

import type { JSX } from "solid-js";

// Top-level <Show> handles UNKNOWN_ROUTE — see examples/web/solid/
// ssr-examples/ssr/src/App.tsx for the hydration-key gap rationale.
export function App(): JSX.Element {
  const routeState = useRoute();
  const isKnownRoute = (): boolean => routeState().route.name !== UNKNOWN_ROUTE;

  return (
    <div>
      <header>
        <nav>
          <Link routeName="home" data-testid="nav-home">
            Home
          </Link>
          {" | "}
          <Link routeName="products.list" data-testid="nav-products-list">
            Products
          </Link>
        </nav>
      </header>
      <main>
        <Show when={isKnownRoute()} fallback={<NotFound />}>
          <RouteView nodeName="">
            <RouteView.Match segment="home">
              <Home />
            </RouteView.Match>
            <RouteView.Match segment="products">
              <RouteView nodeName="products">
                <RouteView.Match segment="list">
                  <ProductsList />
                </RouteView.Match>
                <RouteView.Match segment="detail">
                  <ProductDetail />
                </RouteView.Match>
              </RouteView>
            </RouteView.Match>
          </RouteView>
        </Show>
      </main>
    </div>
  );
}
