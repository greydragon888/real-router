import { RouteView } from "@real-router/react";

import { ProductDetail } from "./ProductDetail";
import { ProductsList } from "./ProductsList";

import type { JSX } from "react";

export function Products(): JSX.Element {
  return (
    <div>
      {/*
        Persistent shell — h1 and intro stay mounted across
        /products ↔ /products/:id navigations. real-router's `forwardTo`
        on the parent route redirects /products → products.list, so the
        inner RouteView always has an active child to render; we never
        hit a "parent active without child" gap.
      */}
      <h1>Products</h1>
      <p>
        Click a product card to see the hero-morph transition. The colored
        square on the card smoothly morphs into the large cover on the detail
        page via matching <code>view-transition-name</code>.
      </p>

      <RouteView nodeName="products">
        <RouteView.Match segment="list">
          <ProductsList />
        </RouteView.Match>
        <RouteView.Match segment="detail">
          <ProductDetail />
        </RouteView.Match>
      </RouteView>
    </div>
  );
}
