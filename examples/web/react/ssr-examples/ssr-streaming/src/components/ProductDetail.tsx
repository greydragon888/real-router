import { useRoute } from "@real-router/react";
import { Suspense } from "react";

import { ProductSpecsModal } from "./ProductSpecsModal";
import { RelatedItems } from "./RelatedItems";
import { Reviews } from "./Reviews";
import { ReviewsErrorBoundary } from "./ReviewsErrorBoundary";

import type { ProductDetailData } from "../router/loaders";
import type { ReactElement } from "react";

export function ProductDetail(): ReactElement {
  const { route } = useRoute();
  const data = route.context.data as ProductDetailData | undefined;

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
        <Suspense
          fallback={<p data-testid="reviews-fallback">Loading reviews…</p>}
        >
          <Reviews productId={product.id} />
        </Suspense>
      </ReviewsErrorBoundary>

      <Suspense
        fallback={<p data-testid="related-fallback">Loading related items…</p>}
      >
        <RelatedItems productId={product.id} />
      </Suspense>
    </article>
  );
}
