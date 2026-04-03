import { Link } from "@real-router/solid";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";

import { store } from "../../../../shared/store";

import type { Product } from "../../../../shared/api";
import type { JSX } from "solid-js";

export function ProductDetail(): JSX.Element {
  const [product, setProduct] = createSignal<Product | null | undefined>(
    store.get("products.detail") as Product | null | undefined,
  );
  const [loading, setLoading] = createSignal<boolean | undefined>(
    store.get("products.detail:loading") as boolean | undefined,
  );

  createEffect(() => {
    const unsub = store.subscribe(() => {
      setProduct(store.get("products.detail") as Product | null | undefined);
      setLoading(store.get("products.detail:loading") as boolean | undefined);
    });

    onCleanup(unsub);
  });

  return (
    <Show
      when={!loading()}
      fallback={
        <div>
          <h1>Product Detail</h1>
          <span class="spinner" />
          <span style={{ "margin-left": "12px" }}>Loading…</span>
        </div>
      }
    >
      <Show
        when={product()}
        fallback={
          <div>
            <h1>Product Detail</h1>
            <p>No product data.</p>
            <Link routeName="products">← Back to Products</Link>
          </div>
        }
      >
        {(p) => (
          <div>
            <h1>{p().name}</h1>
            <div class="card">
              <p>
                <strong>Price:</strong> ${p().price}
              </p>
              <p>
                <strong>Description:</strong> {p().description}
              </p>
            </div>
            <Link routeName="products">← Back to Products</Link>
          </div>
        )}
      </Show>
    </Show>
  );
}
