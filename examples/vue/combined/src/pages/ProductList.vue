<script setup lang="ts">
import { Link } from "@real-router/vue";
import { onMounted, onUnmounted, shallowRef } from "vue";
import { store } from "../../../../shared/store";

import type { Product } from "../../../../shared/api";

const products = shallowRef<Product[] | null>(
  store.get("products.list") as Product[] | null,
);
const loading = shallowRef<boolean | undefined>(
  store.get("products.list:loading") as boolean | undefined,
);
const error = shallowRef<string | null | undefined>(
  store.get("products.list:error") as string | null | undefined,
);

let unsub: (() => void) | undefined;

onMounted(() => {
  unsub = store.subscribe(() => {
    products.value = store.get("products.list") as Product[] | null;
    loading.value = store.get("products.list:loading") as boolean | undefined;
    error.value = store.get("products.list:error") as string | null | undefined;
  });
});

onUnmounted(() => {
  unsub?.();
});
</script>

<template>
  <div v-if="loading">
    <h1>Products</h1>
    <span class="spinner" />
    <span :style="{ marginLeft: '12px' }">Loading products…</span>
  </div>
  <div v-else-if="error">
    <h1>Products</h1>
    <p>Error: {{ error }}</p>
  </div>
  <div v-else-if="!products">
    <h1>Products</h1>
    <p>No data yet.</p>
  </div>
  <div v-else>
    <h1>Products</h1>
    <div v-for="product in products" :key="product.id" class="card">
      <strong>{{ product.name }}</strong>
      <span :style="{ marginLeft: '8px', color: '#888' }"
        >${{ product.price }}</span
      >
      <p>{{ product.description }}</p>
      <Link routeName="products.detail" :routeParams="{ id: product.id }">
        View Details →
      </Link>
    </div>
  </div>
</template>
