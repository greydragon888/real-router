import { Link } from "@real-router/preact";
import { useSyncExternalStore } from "preact/compat";

import { store } from "../../../../shared/store";

import type { Product } from "../../../../shared/api";
import type { JSX } from "preact";

export function ProductList(): JSX.Element {
  const products = useSyncExternalStore(
    store.subscribe,
    () => store.get("products.list") as Product[] | null,
  );
  const loading = useSyncExternalStore(
    store.subscribe,
    () => store.get("products.list:loading") as boolean | undefined,
  );
  const error = useSyncExternalStore(
    store.subscribe,
    () => store.get("products.list:error") as string | null | undefined,
  );

  if (loading) {
    return (
      <div>
        <h1>Products</h1>
        <span className="spinner" />
        <span style={{ marginLeft: "12px" }}>Loading products…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1>Products</h1>
        <p>Error: {error}</p>
      </div>
    );
  }

  if (!products) {
    return (
      <div>
        <h1>Products</h1>
        <p>No data yet.</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Products</h1>
      <p>
        Data loaded via <code>loadData</code> in route config + data-loader
        plugin.
      </p>
      {products.map((product) => (
        <div key={product.id} className="card">
          <strong>{product.name}</strong>
          <span style={{ marginLeft: "8px", color: "#888" }}>
            ${product.price}
          </span>
          <p>{product.description}</p>
          <Link routeName="products.detail" routeParams={{ id: product.id }}>
            View Details →
          </Link>
        </div>
      ))}
    </div>
  );
}
