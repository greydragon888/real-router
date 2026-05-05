import { Link, RouteView } from "@real-router/preact";

import { ProductDetail } from "./components/ProductDetail";
import { ProductsList } from "./components/ProductsList";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";

import type { JSX } from "preact";

export function App(): JSX.Element {
  return (
    <div>
      <nav>
        <Link routeName="home">Home</Link>
        {" | "}
        <Link routeName="products.list">Products</Link>
      </nav>
      <main>
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
          <RouteView.NotFound>
            <NotFound />
          </RouteView.NotFound>
        </RouteView>
      </main>
    </div>
  );
}
