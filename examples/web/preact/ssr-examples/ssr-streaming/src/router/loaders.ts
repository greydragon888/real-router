import { defer } from "@real-router/ssr-data-plugin";
import { LoaderNotFound } from "@real-router/ssr-data-plugin/errors";

import {
  fetchRelated,
  fetchReviews,
  getProduct,
  listProducts,
} from "../database";

import type { Product, RelatedItem, Review } from "../database";
import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

export interface ProductsListData {
  products: Product[];
}

export interface ProductDetailCriticalData {
  product: Product;
}

export const REVIEWS_KEY = "reviews" as const;
export const RELATED_KEY = "related" as const;

export type ReviewsDeferred = Promise<Review[]>;
export type RelatedDeferred = Promise<RelatedItem[]>;

export const loaders: DataLoaderFactoryMap = {
  "products.list": () => () =>
    Promise.resolve({ products: listProducts() } satisfies ProductsListData),
  "products.detail": () => ({ params }) => {
    const id = params.id as string;
    const product = getProduct(id);

    if (!product) {
      throw new LoaderNotFound(`product:${id}`);
    }

    return defer({
      critical: { product } satisfies ProductDetailCriticalData,
      deferred: {
        [REVIEWS_KEY]: fetchReviews(id),
        [RELATED_KEY]: fetchRelated(id),
      },
    });
  },

  // Per-route SSR mode (#597): `ssr: false` aliases to `"client-only"`.
  widget: { ssr: false },
};
