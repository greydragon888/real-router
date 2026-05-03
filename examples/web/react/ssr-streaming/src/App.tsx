import { Link, RouteView } from "@real-router/react";

import { ProductDetail } from "./components/ProductDetail";
import { ProductsList } from "./components/ProductsList";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";

export function App(): React.ReactElement {
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
