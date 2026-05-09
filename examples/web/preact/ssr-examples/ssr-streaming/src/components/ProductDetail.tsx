import { Link, useRoute } from "@real-router/preact";
import { Streamed } from "@real-router/preact/ssr";
import { lazy, Suspense } from "preact/compat";

import { RelatedItems } from "./RelatedItems";
import { Reviews } from "./Reviews";

import type { ProductDetailCriticalData } from "../router/loaders";
import type { JSX } from "preact";

// Code-split the specs section. Independent from the deferred-data path —
// this is component-level lazy loading, not data deferral.
const ProductSpecs = lazy(() => import("./ProductSpecs"));

export function ProductDetail(): JSX.Element {
  const { route } = useRoute();
  const data = route.context.data as ProductDetailCriticalData | undefined;

  if (!data?.product) {
    return (
      <div>
        <h1>Product not found</h1>
        <p>
          <Link routeName="products.list">Back to list</Link>
        </p>
      </div>
    );
  }

  const { product } = data;

  return (
    <article data-testid="product-detail" data-product-id={product.id}>
      <h1 data-testid="product-name">{product.name}</h1>
      <p data-testid="product-description">{product.description}</p>
      <p data-testid="product-price">${product.price.toFixed(2)}</p>

      <Streamed
        fallback={<p data-testid="reviews-fallback">Loading reviews…</p>}
      >
        <Reviews />
      </Streamed>

      <Streamed
        fallback={<p data-testid="related-fallback">Loading related items…</p>}
      >
        <RelatedItems />
      </Streamed>

      <Suspense fallback={<p data-testid="specs-fallback">Loading specs...</p>}>
        <ProductSpecs productId={product.id} />
      </Suspense>

      <p>
        <Link routeName="products.list" data-testid="back-to-list">
          Back to list
        </Link>
      </p>
    </article>
  );
}
