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
      throw new Error(`Product ${id} not found`);
    }

    return Promise.resolve({ product } satisfies ProductDetailData);
  },

  // Per-route SSR mode (#597): `ssr: false` aliases to `"client-only"`.
  // Server skips this entry's loader; mode marker travels via __SSR_STATE__.
  widget: { ssr: false },
};
