import { RouteView } from "@real-router/preact";

import { Home } from "./pages/Home";
import { Products } from "./pages/Products";
import { Layout } from "../../shared/Layout";

import type { JSX } from "preact";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "products", label: "Products" },
];

export function App(): JSX.Element {
  return (
    <Layout title="Real-Router — Search Schema" links={links}>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="products">
          <Products />
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
        </RouteView.NotFound>
      </RouteView>
    </Layout>
  );
}
