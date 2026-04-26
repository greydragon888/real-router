import { RouteView } from "@real-router/react";

import { ProductDetail } from "./ProductDetail";
import { ProductsList } from "./ProductsList";

import type { JSX } from "react";

// Persistent shell: h1 + intro stay mounted across /products ↔ /products/:id.
// IMPORTANT: no `data-route-root` on this outer div. The marker lives inside
// ProductsList and ProductDetail, so the heading + paragraph do NOT fade
// when the inner content swaps. Granular per-page placement is the trade-off
// the CSS-classes recipe makes vs View Transitions, which gets persistent-
// shell crossfade for free via pixel-level snapshot diffing.
export function Products(): JSX.Element {
  return (
    <div
      data-route-root
      data-route-anim="fade"
      data-route-scope="products"
      data-route-scope-mode="subtree"
    >
      <h1>Products</h1>
      <p>
        Click a product card to see the manual hero-morph: the thumbnail&apos;s
        bounding rect is captured before leave, an inverse-FLIP transform on the
        destination cover after the new page mounts. Compare with the parallel{" "}
        <code>view-transitions/</code> example, where the browser pairs{" "}
        <code>view-transition-name</code> values and animates for you in two CSS
        rules.
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
