<script lang="ts">
  interface Review {
    id: string;
    author: string;
    rating: number;
    text: string;
  }

  const REVIEWS_BY_PRODUCT: Record<string, Review[]> = {
    "1": [
      { id: "r1", author: "Alice", rating: 5, text: "Best keyboard I've owned." },
      { id: "r2", author: "Bob", rating: 4, text: "Great feel, slightly loud." },
    ],
    "2": [{ id: "r3", author: "Carol", rating: 5, text: "Wrist pain gone." }],
    "3": [
      { id: "r4", author: "Dave", rating: 5, text: "Colors are gorgeous." },
      { id: "r5", author: "Eve", rating: 4, text: "Stand wobbles a bit." },
    ],
  };

  const SERVER_REVIEWS_DELAY_MS = 600;

  function fetchReviews(productId: string): Promise<Review[]> {
    if (productId === "4") {
      return Promise.reject(new Error("Reviews service unavailable"));
    }

    const reviews = REVIEWS_BY_PRODUCT[productId] ?? [];

    if (typeof globalThis.window === "undefined") {
      return new Promise((resolve) =>
        setTimeout(() => resolve(reviews), SERVER_REVIEWS_DELAY_MS),
      );
    }

    return Promise.resolve(reviews);
  }

  const { productId }: { productId: string } = $props();
</script>

<!--
  hydratable() is called INLINE inside the boundary — not in <script>. The
  Svelte 5 compiler emits an `unresolved_hydratable` warning when a
  hydratable is initialized in <script> but its value is awaited inside a
  boundary's pending snippet, because the pending snippet defers full
  utilization.
-->
{#await fetchReviews(productId)}
  <p data-testid="reviews-fallback">Loading reviews…</p>
{:then reviews}
  {#if reviews.length === 0}
    <p data-testid="reviews-empty">No reviews yet.</p>
  {:else}
    <section data-testid="reviews-section">
      <h2>Reviews ({reviews.length})</h2>
      <ul>
        {#each reviews as review (review.id)}
          <li data-review-id={review.id}>
            <strong>{review.author}</strong> — {review.rating}/5
            <p>{review.text}</p>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{:catch error}
  <p data-testid="reviews-error">Reviews unavailable: {error.message}</p>
{/await}
