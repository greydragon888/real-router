import { useRoute } from "@real-router/react";
import { Streamed } from "@real-router/react/ssr";

import { ProductSpecsModal } from "./ProductSpecsModal";
import { RelatedItems } from "./RelatedItems";
import { Reviews } from "./Reviews";
import { ReviewsErrorBoundary } from "./ReviewsErrorBoundary";

import type { ProductDetailCriticalData } from "../router/loaders";
import type { ReactElement } from "react";

export function ProductDetail(): ReactElement {
  const { route } = useRoute();
  const data = route.context.data as ProductDetailCriticalData | undefined;

  if (!data) {
    return <p data-testid="product-not-found">Product not found.</p>;
  }

  const { product } = data;

  return (
    <article data-testid="product-detail" data-product-id={product.id}>
      <h1 data-testid="product-name">{product.name}</h1>
      <p data-testid="product-price">${product.price}</p>
      <p data-testid="product-description">{product.description}</p>

      <ProductSpecsModal productId={product.id} productName={product.name} />

      <ReviewsErrorBoundary>
        <Streamed
          fallback={<p data-testid="reviews-fallback">Loading reviews…</p>}
        >
          <Reviews />
        </Streamed>
      </ReviewsErrorBoundary>

      <Streamed
        fallback={<p data-testid="related-fallback">Loading related items…</p>}
      >
        <RelatedItems />
      </Streamed>
    </article>
  );
}
