<script setup lang="ts">
import { Link } from "@real-router/vue";
import { onMounted, onUnmounted, shallowRef } from "vue";
import { store } from "../../../../shared/store";

import type { Product } from "../../../../shared/api";

const product = shallowRef<Product | null | undefined>(
  store.get("products.detail") as Product | null | undefined,
);
const loading = shallowRef<boolean | undefined>(
  store.get("products.detail:loading") as boolean | undefined,
);

let unsub: (() => void) | undefined;

onMounted(() => {
  unsub = store.subscribe(() => {
    product.value = store.get("products.detail") as Product | null | undefined;
    loading.value = store.get("products.detail:loading") as boolean | undefined;
  });
});

onUnmounted(() => {
  unsub?.();
});
</script>

<template>
  <div v-if="loading">
    <h1>Product Detail</h1>
    <span class="spinner" />
    <span :style="{ marginLeft: '12px' }">Loading…</span>
  </div>
  <div v-else-if="!product">
    <h1>Product Detail</h1>
    <p>No product data.</p>
    <Link routeName="products">← Back to Products</Link>
  </div>
  <div v-else>
    <h1>{{ product.name }}</h1>
    <div class="card">
      <p><strong>Price:</strong> ${{ product.price }}</p>
      <p><strong>Description:</strong> {{ product.description }}</p>
    </div>
    <Link routeName="products">← Back to Products</Link>
  </div>
</template>
