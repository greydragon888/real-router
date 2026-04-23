import { Link } from "@real-router/solid";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";

import { store } from "../../../../shared/store";

import type { Product } from "../../../../shared/api";
import type { JSX } from "solid-js";

export function ProductList(): JSX.Element {
  const [products, setProducts] = createSignal<Product[] | null>(
    store.get("products.list") as Product[] | null,
  );
  const [loading, setLoading] = createSignal<boolean | undefined>(
    store.get("products.list:loading") as boolean | undefined,
  );
  const [error, setError] = createSignal<string | null | undefined>(
    store.get("products.list:error") as string | null | undefined,
  );

  createEffect(() => {
    const unsub = store.subscribe(() => {
      setProducts(store.get("products.list") as Product[] | null);
      setLoading(store.get("products.list:loading") as boolean | undefined);
      setError(store.get("products.list:error") as string | null | undefined);
    });

    onCleanup(unsub);
  });

  return (
    <Show
      when={!loading()}
      fallback={
        <div>
          <h1>Products</h1>
          <span class="spinner" />
          <span style={{ "margin-left": "12px" }}>Loading products…</span>
        </div>
      }
    >
      <Show
        when={!error()}
        fallback={
          <div>
            <h1>Products</h1>
            <p>Error: {error()}</p>
          </div>
        }
      >
        <Show
          when={products()}
          fallback={
            <div>
              <h1>Products</h1>
              <p>No data yet.</p>
            </div>
          }
        >
          {(prods) => (
            <div>
              <h1>Products</h1>
              <p>
                Data loaded via <code>loadData</code> in route config +
                data-loader plugin.
              </p>
              <For each={prods()}>
                {(product) => (
                  <div class="card">
                    <strong>{product.name}</strong>
                    <span style={{ "margin-left": "8px", color: "#888" }}>
                      ${product.price}
                    </span>
                    <p>{product.description}</p>
                    <Link
                      routeName="products.detail"
                      routeParams={{ id: product.id }}
                    >
                      View Details →
                    </Link>
                  </div>
                )}
              </For>
            </div>
          )}
        </Show>
      </Show>
    </Show>
  );
}
