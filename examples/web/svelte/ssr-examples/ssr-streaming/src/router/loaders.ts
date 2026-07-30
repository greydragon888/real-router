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

export const loaders: DataLoaderFactoryMap = {
  "products.list": () => () =>
    Promise.resolve({ products: listProducts() } satisfies ProductsListData),
  "products.detail": () => ({ params }) => {
    const id = params.id as string;
    const product = getProduct(id);

    if (!product) {
      // Typed error → entry-server.ts maps it to status:404 + plain text.
      // The body is intentionally minimal (no SSR re-render of NotFound
      // page) — keeping the demo simple. A production app could re-render
      // with a different URL.
      throw new LoaderNotFound(`product:${id}`);
    }

    return Promise.resolve({ product } satisfies ProductDetailData);
  },

  // Per-route SSR mode (#597): `ssr: false` aliases to `"client-only"`.
  // Server skips this entry's loader; mode marker travels via __SSR_STATE__.
  widget: { ssr: false },
};
