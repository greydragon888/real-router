import { RouteView } from "@real-router/react";

import { AnimatedRoute } from "./components/AnimatedRoute";
import { SmartNavButtons } from "./components/SmartNavButtons";
import { VisitedBadges } from "./components/VisitedBadges";
import { About } from "./pages/About";
import { Cart } from "./pages/Cart";
import { Categories } from "./pages/Categories";
import { Checkout } from "./pages/Checkout";
import { Home } from "./pages/Home";
import { Product } from "./pages/Product";
import { ProductEdit } from "./pages/ProductEdit";
import { Products } from "./pages/Products";

import type { JSX } from "react";

export function App(): JSX.Element {
  return (
    <div className="app">
      <header className="header">
        Real-Router — Navigation API exclusive extensions
      </header>
      <aside className="sidebar">
        <VisitedBadges />
      </aside>
      <main className="content">
        <SmartNavButtons />
        <div style={{ padding: "24px" }}>
          <AnimatedRoute>
            <RouteView nodeName="">
              <RouteView.Match segment="home" exact>
                <Home />
              </RouteView.Match>
              <RouteView.Match segment="products" exact>
                <Products />
              </RouteView.Match>
              <RouteView.Match segment="products.product" exact>
                <Product />
              </RouteView.Match>
              <RouteView.Match segment="products.product.edit" exact>
                <ProductEdit />
              </RouteView.Match>
              <RouteView.Match segment="categories" exact>
                <Categories />
              </RouteView.Match>
              <RouteView.Match segment="cart" exact>
                <Cart />
              </RouteView.Match>
              <RouteView.Match segment="checkout" exact>
                <Checkout />
              </RouteView.Match>
              <RouteView.Match segment="about" exact>
                <About />
              </RouteView.Match>
              <RouteView.NotFound>
                <h1>404 — Page Not Found</h1>
                <p>The page you are looking for does not exist.</p>
              </RouteView.NotFound>
            </RouteView>
          </AnimatedRoute>
        </div>
      </main>
      <footer className="footer">@real-router/navigation-plugin</footer>
    </div>
  );
}
