import { RouteView } from "@real-router/react";

import { ProductDetail } from "./ProductDetail";
import { ProductsList } from "./ProductsList";

import type { JSX } from "react";

// Persistent shell — h1 + intro stay mounted across /products ↔ /products/:id.
// In the distributed page-animations pattern, only leaf pages
// (ProductsList / ProductDetail) install the `useRouteAnimation` hook.
// Products itself is the parent route ("products" is both shell + list-view
// route name) and stays mounted across nested navigations, so it doesn't
// need its own animation hook — the inner leaf handles its own exit.
//
// Trade-off vs view-transitions / route-animations: when navigating from
// /products to /about (cross-tree leave), the leaf's exit animation fades
// the inner content but the shell (h1 + intro) unmounts instantly with
// React's tree removal — there's no scope-resolution mechanism in the
// distributed pattern to detect "the shell is also leaving". Mostly fine
// in practice; for full shell-aware exit see route-animations/.
export function Products(): JSX.Element {
  return (
    <div>
      <h1>Products</h1>
      <p>
        Click a product to see the detail. Each page (this list and the
        detail) registers its own <code>useRouteAnimation</code> hook on its
        wrapper. The <code>products</code> shell here is persistent — it
        stays mounted across <code>/products</code> ↔{" "}
        <code>/products/:id</code> navigations.
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
