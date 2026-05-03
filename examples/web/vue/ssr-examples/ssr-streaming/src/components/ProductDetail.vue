<script setup lang="ts">
import { useRoute } from "@real-router/vue";
import { computed } from "vue";

import RelatedItems from "./RelatedItems.vue";
import Reviews from "./Reviews.vue";
import ReviewsErrorBoundary from "./ReviewsErrorBoundary.vue";

import type { ProductDetailData } from "../router/loaders";

const { route } = useRoute();
const data = computed<ProductDetailData | undefined>(
  () => route.value.context.data as ProductDetailData | undefined,
);
</script>

<template>
  <p v-if="!data" data-testid="product-not-found">Product not found.</p>
  <article
    v-else
    data-testid="product-detail"
    :data-product-id="data.product.id"
  >
    <h1 data-testid="product-name">{{ data.product.name }}</h1>
    <p data-testid="product-price">${{ data.product.price }}</p>
    <p data-testid="product-description">{{ data.product.description }}</p>

    <ReviewsErrorBoundary>
      <Suspense>
        <Reviews :productId="data.product.id" />
        <template #fallback>
          <p data-testid="reviews-fallback">Loading reviews…</p>
        </template>
      </Suspense>
    </ReviewsErrorBoundary>

    <Suspense>
      <RelatedItems :productId="data.product.id" />
      <template #fallback>
        <p data-testid="related-fallback">Loading related items…</p>
      </template>
    </Suspense>
  </article>
</template>
