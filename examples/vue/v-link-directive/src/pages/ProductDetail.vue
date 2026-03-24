<script setup lang="ts">
import { Link, useRouteNode } from "@real-router/vue";
import { computed } from "vue";

const productData: Record<
  string,
  { name: string; price: string; description: string }
> = {
  "1": {
    name: "Laptop",
    price: "$999",
    description: "High-performance laptop",
  },
  "2": { name: "Phone", price: "$699", description: "Latest smartphone" },
  "3": { name: "Tablet", price: "$449", description: "Portable tablet" },
};

const { route } = useRouteNode("products.detail");

const id = computed(() => {
  if (route.value && typeof route.value.params.id === "string") {
    return route.value.params.id;
  }

  return "";
});

const product = computed(() => (id.value ? productData[id.value] : undefined));
</script>

<template>
  <div v-if="product">
    <h1>{{ product.name }}</h1>
    <div class="card">
      <p><strong>Price:</strong> {{ product.price }}</p>
      <p><strong>Description:</strong> {{ product.description }}</p>
    </div>
    <Link routeName="home">← Back to Products</Link>
  </div>
  <div v-else>
    <h1>Product Not Found</h1>
    <Link routeName="home">← Back</Link>
  </div>
</template>
