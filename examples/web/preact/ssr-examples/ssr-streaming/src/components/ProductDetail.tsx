import { Link, useRoute } from "@real-router/preact";

import { RelatedItems } from "./RelatedItems";
import { Reviews } from "./Reviews";

import type { ProductDetailData } from "../router/loaders";
import type { JSX } from "preact";

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

      {/* Reviews and RelatedItems are rendered synchronously from
          module-level fixtures. In React 19's analog, they use
          <Suspense> + use(promise) for in-component data deferral.
          Preact 10 has no equivalent (v11 may add one) — see README. */}
      <Reviews productId={product.id} />
      <RelatedItems productId={product.id} />

      <p>
        <Link routeName="products.list" data-testid="back-to-list">
          Back to list
        </Link>
      </p>
    </article>
  );
}
