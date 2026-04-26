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
      </div>
    </Layout>
  );
}
