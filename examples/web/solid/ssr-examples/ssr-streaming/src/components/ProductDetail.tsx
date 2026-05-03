import { useRoute } from "@real-router/solid";
import { ErrorBoundary, Show, Suspense } from "solid-js";

import { RelatedItems } from "./RelatedItems";
import { Reviews } from "./Reviews";

import type { ProductDetailData } from "../router/loaders";
import type { JSX } from "solid-js";

export function ProductDetail(): JSX.Element {
  const routeState = useRoute();
  const data = (): ProductDetailData | undefined =>
    routeState().route.context.data as ProductDetailData | undefined;

  return (
    <Show
      when={data()}
      fallback={<p data-testid="product-not-found">Product not found.</p>}
      keyed
    >
      {(d) => (
        <article data-testid="product-detail" data-product-id={d.product.id}>
          <h1 data-testid="product-name">{d.product.name}</h1>
          <p data-testid="product-price">${d.product.price}</p>
          <p data-testid="product-description">{d.product.description}</p>

          <ErrorBoundary
            fallback={(err: Error) => (
              <p data-testid="reviews-error">
                Reviews unavailable: {err.message}
              </p>
            )}
          >
            <Suspense
              fallback={<p data-testid="reviews-fallback">Loading reviews…</p>}
            >
              <Reviews productId={d.product.id} />
            </Suspense>
          </ErrorBoundary>

          <Suspense
            fallback={
              <p data-testid="related-fallback">Loading related items…</p>
            }
          >
            <RelatedItems productId={d.product.id} />
          </Suspense>
        </article>
      )}
    </Show>
  );
}
