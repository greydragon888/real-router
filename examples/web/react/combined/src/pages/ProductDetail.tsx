import { Link } from "@real-router/react";
import { useSyncExternalStore } from "react";

import { store } from "../../../../shared/store";

import type { Product } from "../../../../shared/api";
import type { JSX } from "react";

export function ProductDetail(): JSX.Element {
  const product = useSyncExternalStore(
    store.subscribe,
    () => store.get("products.detail") as Product | null | undefined,
  );
  const loading = useSyncExternalStore(
    store.subscribe,
    () => store.get("products.detail:loading") as boolean | undefined,
  );

  if (loading) {
    return (
      <div>
        <h1>Product Detail</h1>
        <span className="spinner" />
        <span style={{ marginLeft: "12px" }}>Loading…</span>
      </div>
    );
  }

  if (!product) {
    return (
      <div>
        <h1>Product Detail</h1>
        <p>No product data.</p>
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
      </div>
      <Link routeName="products">← Back to Products</Link>
    </div>
  );
}
