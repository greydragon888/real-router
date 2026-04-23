<script lang="ts">
  import { Link } from "@real-router/svelte";
  import { store } from "../../../../shared/store";

  import type { Product } from "../../../../shared/api";

  let product = $state(store.get("products.detail") as Product | null | undefined);
  let loading = $state(store.get("products.detail:loading") as boolean | undefined);
  let error = $state(store.get("products.detail:error") as string | null | undefined);

  $effect(() => {
    return store.subscribe(() => {
      product = store.get("products.detail") as Product | null | undefined;
      loading = store.get("products.detail:loading") as boolean | undefined;
      error = store.get("products.detail:error") as string | null | undefined;
    });
  });
</script>

{#if loading}
  <div>
    <h1>Product</h1>
    <span class="spinner"></span>
    <span style="margin-left: 12px">Loading product…</span>
  </div>
{:else if error}
  <div>
    <h1>Product</h1>
    <p>Error: {error}</p>
    <Link routeName="products">← Back to Products</Link>
  </div>
{:else if !product}
  <div>
    <h1>Product</h1>
    <p>Product not found.</p>
    <Link routeName="products">← Back to Products</Link>
  </div>
{:else}
  <div>
    <h1>{product.name}</h1>
    <div class="card">
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
{/if}
