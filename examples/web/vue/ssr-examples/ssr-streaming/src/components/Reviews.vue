<script setup lang="ts">
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
  // Demonstrates Suspense-boundary error containment for product id "4":
  // the server resolves an empty list (no SSR error), but the client
  // re-fetch rejects synchronously on hydration; <ReviewsErrorBoundary>
  // catches via Vue's onErrorCaptured and renders a fallback.
  if (productId === "4") {
    if (typeof globalThis.window === "undefined") {
      return Promise.resolve([]);
    }

    return Promise.reject(new Error("Reviews service unavailable"));
  }

  const reviews = REVIEWS_BY_PRODUCT[productId] ?? [];

  if (typeof globalThis.window === "undefined") {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(reviews);
      }, SERVER_REVIEWS_DELAY_MS);
    });
  }

  return Promise.resolve(reviews);
}

const props = defineProps<{ productId: string }>();

const reviews = await fetchReviews(props.productId);
</script>

<template>
  <p v-if="reviews.length === 0" data-testid="reviews-empty">
    No reviews yet.
  </p>
  <section v-else data-testid="reviews-section">
    <h2>Reviews ({{ reviews.length }})</h2>
    <ul>
      <li
        v-for="review in reviews"
        :key="review.id"
        :data-review-id="review.id"
      >
        <strong>{{ review.author }}</strong> — {{ review.rating }}/5
        <p>{{ review.text }}</p>
      </li>
    </ul>
  </section>
</template>
