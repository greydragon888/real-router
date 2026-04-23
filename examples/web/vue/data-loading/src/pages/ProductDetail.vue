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
const error = shallowRef<string | null | undefined>(
  store.get("products.detail:error") as string | null | undefined,
);

let unsub: (() => void) | undefined;

onMounted(() => {
  unsub = store.subscribe(() => {
    product.value = store.get("products.detail") as Product | null | undefined;
    loading.value = store.get("products.detail:loading") as boolean | undefined;
    error.value = store.get("products.detail:error") as
      | string
      | null
      | undefined;
  });
});

onUnmounted(() => {
  unsub?.();
});
</script>

<template>
  <div v-if="loading">
    <h1>Product</h1>
    <span class="spinner" />
    <span :style="{ marginLeft: '12px' }">Loading product…</span>
  </div>
  <div v-else-if="error">
    <h1>Product</h1>
    <p>Error: {{ error }}</p>
    <Link routeName="products">← Back to Products</Link>
  </div>
  <div v-else-if="!product">
    <h1>Product</h1>
    <p>Product not found.</p>
    <Link routeName="products">← Back to Products</Link>
  </div>
  <div v-else>
    <h1>{{ product.name }}</h1>
    <div class="card">
      <p><strong>Price:</strong> ${{ product.price }}</p>
      <p><strong>Description:</strong> {{ product.description }}</p>
      <p><strong>ID:</strong> {{ product.id }}</p>
    </div>
    <Link routeName="products">← Back to Products</Link>
  </div>
</template>
