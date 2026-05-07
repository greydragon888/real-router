import { Link, useRoute } from "@real-router/preact";
import { lazy, Suspense } from "preact/compat";

import { RelatedItems } from "./RelatedItems";
import { Reviews } from "./Reviews";

import type { ProductDetailData } from "../router/loaders";
import type { JSX } from "preact";

// Code-split the specs section. The dynamic import becomes a separate
// chunk in the client bundle; on the server, preact-render-to-string's
// renderToReadableStream emits the Suspense fallback first, awaits
// the import promise, then flushes the resolved chunk into the same
// streamed response. This is the Preact 10 equivalent of "lazy
// streaming" — true HTTP-level deferral of component HTML, distinct
// from the data-deferral pattern that requires use(promise).
const ProductSpecs = lazy(() => import("./ProductSpecs"));

export function ProductDetail(): JSX.Element {
  const { route } = useRoute();
  const data = route.context.data as ProductDetailData | undefined;

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

      {/* Reviews and RelatedItems render synchronously from module-
          level fixtures. In React 19's analog, they use <Suspense> +
          use(promise) for in-component data deferral. Preact 10 has
          no use(promise) equivalent (v11 may add one). */}
      <Reviews productId={product.id} />
      <RelatedItems productId={product.id} />

      {/* lazy() + Suspense — Preact 10 streaming pattern that DOES
          work end-to-end: the specs section's HTML is deferred until
          the dynamic import settles, fallback streams first. Verified
          empirically in the spec — chunked HTML contains both
          "specs-fallback" early AND "specs-section" later in the
          response body. */}
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
