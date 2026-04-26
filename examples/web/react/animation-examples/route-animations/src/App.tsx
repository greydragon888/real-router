import { RouteView } from "@real-router/react";

import { About } from "./pages/About";
import { Home } from "./pages/Home";
import { Products } from "./pages/Products";
import { QueryDemo } from "./pages/QueryDemo";
import { Layout } from "../../../shared/Layout";

import type { JSX } from "react";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "products", label: "Products" },
  { routeName: "queryDemo", label: "Query demo" },
];

export function App(): JSX.Element {
  // No `data-route-root` here. The marker lives on each leaf page's outermost
  // contentful element so persistent shells (e.g. <Products>'s h1 + intro)
  // do not fade across products ↔ products.detail navigations. The recipe
  // queries `[data-route-root]` and finds exactly one — the active leaf.
  return (
    <Layout title="Real-Router — Route Animations" links={links}>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="products">
          <Products />
        </RouteView.Match>
        <RouteView.Match segment="about">
          <About />
        </RouteView.Match>
        <RouteView.Match segment="queryDemo">
          <QueryDemo />
        </RouteView.Match>
        <RouteView.NotFound>
          <h1>404 — Page Not Found</h1>
          <p>The page you are looking for does not exist.</p>
        </RouteView.NotFound>
      </RouteView>
    </Layout>
  );
}
