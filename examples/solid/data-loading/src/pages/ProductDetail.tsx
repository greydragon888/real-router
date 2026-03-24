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
  const [error, setError] = createSignal<string | null | undefined>(
    store.get("products.detail:error") as string | null | undefined,
  );

  createEffect(() => {
    const unsub = store.subscribe(() => {
      setProduct(store.get("products.detail") as Product | null | undefined);
      setLoading(store.get("products.detail:loading") as boolean | undefined);
      setError(store.get("products.detail:error") as string | null | undefined);
    });
    onCleanup(unsub);
  });

  return (
    <Show
      when={!loading()}
      fallback={
        <div>
          <h1>Product</h1>
          <span class="spinner" />
          <span style={{ "margin-left": "12px" }}>Loading product…</span>
        </div>
      }
    >
      <Show
        when={!error()}
        fallback={
          <div>
            <h1>Product</h1>
            <p>Error: {error()}</p>
            <Link routeName="products">← Back to Products</Link>
          </div>
        }
      >
        <Show
          when={product()}
          fallback={
            <div>
              <h1>Product</h1>
              <p>Product not found.</p>
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
                <p>
                  <strong>ID:</strong> {p().id}
                </p>
              </div>
              <Link routeName="products">← Back to Products</Link>
            </div>
          )}
        </Show>
      </Show>
    </Show>
  );
}
