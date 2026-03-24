import { RouteView } from "@real-router/solid";

import { Home } from "./pages/Home";
import { ProductDetail } from "./pages/ProductDetail";
import { Settings } from "./pages/Settings";
import { Layout } from "../../shared/Layout";

import type { JSX } from "solid-js";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "settings", label: "Settings" },
];

export function App(): JSX.Element {
  return (
    <Layout title="Real-Router — use:link Directive" links={links}>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="products">
          <RouteView nodeName="products">
            <RouteView.Match segment="detail">
              <ProductDetail />
            </RouteView.Match>
          </RouteView>
        </RouteView.Match>
        <RouteView.Match segment="settings">
          <Settings />
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
        </RouteView.NotFound>
      </RouteView>
    </Layout>
  );
}
