import { RouteView } from "@real-router/react";

import { AbortRacing } from "./pages/AbortRacing";
import { About } from "./pages/About";
import { Home } from "./pages/Home";
import { ProductDetail } from "./pages/ProductDetail";
import { Products } from "./pages/Products";
import { QueryDemo } from "./pages/QueryDemo";
import { ReducedMotion } from "./pages/ReducedMotion";
import { Layout } from "../../shared/Layout";

import type { JSX } from "react";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "products", label: "Products" },
  { routeName: "about", label: "About" },
  { routeName: "queryDemo", label: "Query demo" },
  { routeName: "reducedMotion", label: "Reduced motion" },
  { routeName: "abortRacing", label: "Abort racing" },
];

export function App(): JSX.Element {
  return (
    <Layout title="Real-Router — View Transitions" links={links}>
      {/*
        data-route-root marks the container VT should snapshot. Pseudo-elements
        ::view-transition-old/new target this through the root transition. Keep
        it as the single wrapper around RouteView; nested VT names apply on
        descendants (e.g. product covers for hero morph, product-list for
        per-area scoped transitions).
      */}
      <div data-route-root>
        <RouteView nodeName="">
          <RouteView.Match segment="home">
            <Home />
          </RouteView.Match>
          <RouteView.Match segment="products">
            <Products />
          </RouteView.Match>
          <RouteView.Match segment="productDetail">
            <ProductDetail />
          </RouteView.Match>
          <RouteView.Match segment="about">
            <About />
          </RouteView.Match>
          <RouteView.Match segment="queryDemo">
            <QueryDemo />
          </RouteView.Match>
          <RouteView.Match segment="reducedMotion">
            <ReducedMotion />
          </RouteView.Match>
          <RouteView.Match segment="abortRacing">
            <AbortRacing />
          </RouteView.Match>
          <RouteView.NotFound>
            <h1>404 — Page Not Found</h1>
            <p>The page you are looking for does not exist.</p>
          </RouteView.NotFound>
        </RouteView>
      </div>
    </Layout>
  );
}
