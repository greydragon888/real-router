<script lang="ts">
  interface RelatedItem {
    id: string;
    name: string;
    price: number;
  }

  const RELATED_BY_PRODUCT: Record<string, RelatedItem[]> = {
    "1": [
      { id: "k1", name: "Wrist Rest", price: 24.99 },
      { id: "k2", name: "Keycap Puller", price: 6.5 },
    ],
    "2": [
      { id: "m1", name: "Mouse Pad", price: 14.99 },
      { id: "m2", name: "USB-C Hub", price: 39.99 },
    ],
    "3": [
      { id: "d1", name: "Monitor Arm", price: 79 },
      { id: "d2", name: "USB-C Cable", price: 12.99 },
    ],
  };

  const SERVER_RELATED_DELAY_MS = 1200;

  function fetchRelated(productId: string): Promise<RelatedItem[]> {
    const items = RELATED_BY_PRODUCT[productId] ?? [];

    if (typeof globalThis.window === "undefined") {
      return new Promise((resolve) =>
        setTimeout(() => resolve(items), SERVER_RELATED_DELAY_MS),
      );
    }

    return Promise.resolve(items);
  }

  const { productId }: { productId: string } = $props();
</script>

{#await fetchRelated(productId)}
  <p data-testid="related-fallback">Loading related items…</p>
{:then items}
  <section data-testid="related-section">
    <h2>You might also like</h2>
    <ul>
      {#each items as item (item.id)}
        <li data-related-id={item.id}>
          {item.name} — ${item.price}
        </li>
      {/each}
    </ul>
  </section>
{/await}
