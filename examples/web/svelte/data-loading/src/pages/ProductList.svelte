<script lang="ts">
  import { Link } from "@real-router/svelte";
  import { store } from "../../../../shared/store";

  import type { Product } from "../../../../shared/api";

  let products = $state(store.get("products.list") as Product[] | null);
  let loading = $state(store.get("products.list:loading") as boolean | undefined);
  let error = $state(store.get("products.list:error") as string | null | undefined);

  $effect(() => {
    return store.subscribe(() => {
      products = store.get("products.list") as Product[] | null;
      loading = store.get("products.list:loading") as boolean | undefined;
      error = store.get("products.list:error") as string | null | undefined;
    });
  });
</script>

{#if loading}
  <div>
    <h1>Products</h1>
    <span class="spinner"></span>
    <span style="margin-left: 12px">Loading products…</span>
  </div>
{:else if error}
  <div>
    <h1>Products</h1>
    <p>Error: {error}</p>
  </div>
{:else if !products}
  <div>
    <h1>Products</h1>
    <p>No data yet.</p>
  </div>
{:else}
  <div>
    <h1>Products</h1>
    <p>
      Data loaded via <code>loadData</code> in route config + data-loader
      plugin.
    </p>
    {#each products as product}
      <div class="card">
        <strong>{product.name}</strong>
        <span style="margin-left: 8px; color: #888">
          ${product.price}
        </span>
        <p>{product.description}</p>
        <Link routeName="products.detail" routeParams={{ id: product.id }}>
          View Details →
        </Link>
      </div>
    {/each}
  </div>
{/if}
