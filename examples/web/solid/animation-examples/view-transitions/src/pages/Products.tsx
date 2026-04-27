import { RouteView } from "@real-router/solid";

import { ProductDetail } from "./ProductDetail";
import { ProductsList } from "./ProductsList";

import type { JSX } from "solid-js";

export function Products(): JSX.Element {
  // Persistent shell — h1 and intro stay mounted across
  // /products ↔ /products/:id navigations. The `products` route IS the list
  // (no synthetic `list` child / `forwardTo`); only `detail` is a real
  // descendant. <RouteView.Self> renders ProductsList when the active route
  // is `products` itself; <RouteView.Match segment="detail"> renders
  // ProductDetail when /products/:id is active.
  return (
    <div>
      <h1>Products</h1>
      <p>
        Click a product card to see the hero-morph transition. The colored
        square on the card smoothly morphs into the large cover on the detail
        page via matching <code>view-transition-name</code>.
      </p>

      <RouteView nodeName="products">
        <RouteView.Self>
          <ProductsList />
        </RouteView.Self>
        <RouteView.Match segment="detail">
          <ProductDetail />
        </RouteView.Match>
      </RouteView>
    </div>
  );
}
