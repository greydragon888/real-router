import { LoaderNotFound } from "@real-router/ssr-data-plugin/errors";

import { getProduct, listProducts } from "../database";

import type { Product } from "../database";
import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

export interface ProductsListData {
  products: Product[];
}

export interface ProductDetailData {
  product: Product;
}

// Solid streams `<Suspense>` boundaries natively via `createResource` +
// selective hydration — server-side resources serialize through Solid's own
// `$df()` splice scripts, and the client picks them up without a separate
// transport bridge. So this example pairs `ssr-data-plugin` for the critical
// product fetch with **per-component `createResource`** for the streaming
// review/related sections, instead of `defer({ critical, deferred })`.
//
// `defer()` is shipped for the React/Preact/Vue/Svelte/Angular adapters where
// the absence of a built-in resource serialization layer makes the explicit
// critical/deferred wire format necessary. See `examples/web/react/ssr-examples
// /ssr-streaming/` for the symmetric `defer()` usage.
export const loaders: DataLoaderFactoryMap = {
  "products.list": () => () =>
    Promise.resolve({ products: listProducts() } satisfies ProductsListData),
  "products.detail": () => ({ params }) => {
    const id = params.id as string;
    const product = getProduct(id);

    if (!product) {
      throw new LoaderNotFound(`product:${id}`);
    }

    return { product } satisfies ProductDetailData;
  },

  // Per-route SSR mode (#597): `ssr: false` aliases to `"client-only"`.
  widget: { ssr: false },
};
