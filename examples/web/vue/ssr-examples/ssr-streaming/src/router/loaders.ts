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

  "products.detail": () => (params) => {
    const id = params.id as string;
    const product = getProduct(id);

    if (!product) {
      // Typed error so server/index.ts can map it to 404 text/plain
      // BEFORE starting the streamed render. Previously this threw a
      // generic Error which surfaced as 500 + leaked the router (the
      // catch path never called cleanup()).
      throw new LoaderNotFound(`product:${id}`);
    }

    return Promise.resolve({ product } satisfies ProductDetailData);
  },

  // Per-route SSR mode (#597): `ssr: false` aliases to `"client-only"`.
  // Server skips this entry's loader; mode marker travels via __SSR_STATE__.
  widget: { ssr: false },
};
