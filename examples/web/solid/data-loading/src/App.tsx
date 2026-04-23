import { RouteView } from "@real-router/solid";

import { Home } from "./pages/Home";
import { ProductDetail } from "./pages/ProductDetail";
import { ProductList } from "./pages/ProductList";
import { Layout } from "../../shared/Layout";

import type { JSX } from "solid-js";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "products", label: "Products" },
];

function ProductsView(): JSX.Element {
  return (
    <RouteView nodeName="products">
      <RouteView.Match segment="list">
        <ProductList />
      </RouteView.Match>
      <RouteView.Match segment="detail">
        <ProductDetail />
      </RouteView.Match>
    </RouteView>
  );
}

export function App(): JSX.Element {
  return (
    <Layout title="Real-Router — Data Loading" links={links}>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="products">
          <ProductsView />
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
        </RouteView.NotFound>
      </RouteView>
    </Layout>
  );
}
