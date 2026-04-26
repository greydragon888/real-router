import { RouteView } from "@real-router/react";

import { ProductDetail } from "./ProductDetail";
import { ProductsList } from "./ProductsList";

import type { JSX } from "react";

// Persistent shell — h1 + intro stay mounted across /products ↔
// /products/:id. The page-level <AnimatePresence> in App.tsx is keyed by
// `exitToken` (bumped in `subscribeLeave`), so when navigating between
// list and detail the entire motion.div exits and re-enters — including
// this shell. That means the shell visually transitions too, even though
// React keeps the component instance during inner-route navigation. For
// the use-case of motion-animations (library-driven page transitions),
// this is the natural visual behaviour.
//
// `layoutId="product-${id}"` on the ProductsList thumbnails and the
// ProductDetail cover bridges the two routes via the library's shared-
// layout animation: motion caches layout info on the unmounting thumb
// and uses it as the start position for the new cover mount, FLIP'ing
// across the route boundary.
export function Products(): JSX.Element {
  return (
    <div>
      <h1>Products</h1>
      <p>
        Click a product card to see the layoutId hero morph. The
        thumbnail&apos;s coloured square is paired with the cover via{" "}
        <code>layoutId=&quot;product-&#123;id&#125;&quot;</code> — library
        FLIP&apos;s it automatically across the route boundary.
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
