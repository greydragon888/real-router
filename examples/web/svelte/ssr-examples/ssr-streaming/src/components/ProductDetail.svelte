<script lang="ts">
  import { useRoute } from "@real-router/svelte";

  import { trackView } from "../actions/track-view";
  import ProductActions from "./ProductActions.svelte";
  import RelatedItems from "./RelatedItems.svelte";
  import Reviews from "./Reviews.svelte";
  import ServerStats from "./ServerStats.svelte";

  import type { ProductDetailData } from "../router/loaders";

  const { route } = useRoute();
  const data = $derived(
    route.current.context.data as ProductDetailData | undefined,
  );

  // Reactive override for the tracked product id, used to demonstrate
  // the `use:trackView` action's `update` lifecycle hook. Clicking the
  // button below flips `trackedId` from data.product.id to "999" — Svelte
  // re-evaluates the action argument and calls `action.update({...})`.
  // The action mutates its internal `currentProductId` without
  // re-creating the IntersectionObserver, so the next intersect event
  // (or the update call itself, which we log) uses the new id.
  let manualOverride = $state<string | null>(null);
  const trackedId = $derived(manualOverride ?? data?.product.id ?? "");
</script>

{#if !data}
  <p data-testid="product-not-found">Product not found.</p>
{:else}
  <article
    data-testid="product-detail"
    data-product-id={data.product.id}
    use:trackView={{ productId: trackedId }}
  >
    <h1 data-testid="product-name">{data.product.name}</h1>
    <p data-testid="product-price">${data.product.price}</p>
    <p data-testid="product-description">{data.product.description}</p>

    <Reviews productId={data.product.id} />

    <!--
      <svelte:boundary pending> + top-level await in ServerStats.svelte:
      a different deferred-data shape than {#await}. The boundary's
      pending snippet renders WHILE the child's top-level await resolves
      (server: blocks render() until resolved, ships resolved HTML;
      client: pending visible only if resolution is genuinely slow).
      Compare with Reviews above which uses {#await} in template — that
      one ALWAYS ships the pending fallback in the SSR response.
    -->
    <svelte:boundary>
      <ServerStats productId={data.product.id} />

      {#snippet pending()}
        <p data-testid="stats-pending">Loading server stats…</p>
      {/snippet}

      {#snippet failed(error, reset)}
        <p data-testid="stats-failed">
          Stats unavailable: {(error as Error).message}
        </p>
        <button type="button" data-testid="stats-reset" onclick={reset}>
          Try again
        </button>
      {/snippet}
    </svelte:boundary>

    <RelatedItems productId={data.product.id} />

    <ProductActions />

    <button
      type="button"
      data-testid="override-tracked-id"
      onclick={() => (manualOverride = "999")}
    >
      Override tracked id to 999
    </button>
  </article>
{/if}
