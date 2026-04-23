import { Link } from "@real-router/preact";
import { useSyncExternalStore } from "preact/compat";

import { store } from "../../../../shared/store";

import type { Product } from "../../../../shared/api";
import type { JSX } from "preact";

export function ProductDetail(): JSX.Element {
  const product = useSyncExternalStore(
    store.subscribe,
    () => store.get("products.detail") as Product | null | undefined,
  );
  const loading = useSyncExternalStore(
    store.subscribe,
    () => store.get("products.detail:loading") as boolean | undefined,
  );
  const error = useSyncExternalStore(
    store.subscribe,
    () => store.get("products.detail:error") as string | null | undefined,
  );

  if (loading) {
    return (
      <div>
        <h1>Product</h1>
        <span className="spinner" />
        <span style={{ marginLeft: "12px" }}>Loading product…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1>Product</h1>
        <p>Error: {error}</p>
        <Link routeName="products">← Back to Products</Link>
      </div>
    );
  }

  if (!product) {
    return (
      <div>
        <h1>Product</h1>
        <p>Product not found.</p>
        <Link routeName="products">← Back to Products</Link>
      </div>
    );
  }

  return (
    <div>
      <h1>{product.name}</h1>
      <div className="card">
        <p>
          <strong>Price:</strong> ${product.price}
        </p>
        <p>
          <strong>Description:</strong> {product.description}
        </p>
        <p>
          <strong>ID:</strong> {product.id}
        </p>
      </div>
      <Link routeName="products">← Back to Products</Link>
    </div>
  );
}
