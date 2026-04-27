import { RouteView } from "@real-router/solid";

import { useHeroMorph } from "./animations/useHeroMorph";
import { useListFlip } from "./animations/useListFlip";
import { usePageAnimator } from "./animations/usePageAnimator";
import { About } from "./pages/About";
import { Home } from "./pages/Home";
import { ProductDetail } from "./pages/ProductDetail";
import { ProductsList } from "./pages/ProductsList";
import { QueryDemo } from "./pages/QueryDemo";
import { Layout } from "../../../shared/Layout";

import type { JSX } from "solid-js";

const links = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "products", label: "Products" },
  { routeName: "queryDemo", label: "Query demo" },
];

export function App(): JSX.Element {
  // Three thin hooks own the app's animation behavior — each calls
  // `useRouteExit` from `@real-router/solid` once with its own recipe:
  //   - usePageAnimator: page-level fade/slide on cross-route nav
  //   - useHeroMorph: cross-component DOM rect capture (products ↔ detail)
  //   - useListFlip: same-route list reorder + ghost exits (sort/filter)
  //
  // No `data-route-root` on this outer div. The marker lives on each
  // leaf page's outermost contentful element. The page-level hook
  // queries `[data-route-root]` and finds exactly one — the active leaf.
  usePageAnimator();
  useHeroMorph();
  useListFlip();

  return (
    <Layout title="Real-Router — Route Animations" links={links}>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="products">
          <RouteView nodeName="products">
            <RouteView.Self>
              <ProductsList />
            </RouteView.Self>
            <RouteView.Match segment="detail">
              <ProductDetail />
            </RouteView.Match>
          </RouteView>
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
