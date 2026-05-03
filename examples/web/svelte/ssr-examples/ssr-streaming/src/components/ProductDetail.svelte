<script lang="ts">
  import { useRoute } from "@real-router/svelte";

  import RelatedItems from "./RelatedItems.svelte";
  import Reviews from "./Reviews.svelte";

  import type { ProductDetailData } from "../router/loaders";

  const { route } = useRoute();
  const data = $derived(
    route.current.context.data as ProductDetailData | undefined,
  );
</script>

{#if !data}
  <p data-testid="product-not-found">Product not found.</p>
{:else}
  <article data-testid="product-detail" data-product-id={data.product.id}>
    <h1 data-testid="product-name">{data.product.name}</h1>
    <p data-testid="product-price">${data.product.price}</p>
    <p data-testid="product-description">{data.product.description}</p>

    <Reviews productId={data.product.id} />

    <RelatedItems productId={data.product.id} />
  </article>
{/if}
