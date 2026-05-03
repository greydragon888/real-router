<script setup lang="ts">
import { Link, useRoute } from "@real-router/vue";
import { computed } from "vue";

import type { ProductsListData } from "../router/loaders";

const { route } = useRoute();
const data = computed<ProductsListData>(
  () => (route.value.context.data as ProductsListData | undefined) ?? { products: [] },
);
</script>

<template>
  <section data-testid="products-list">
    <h1>Products</h1>
    <ul>
      <li
        v-for="product in data.products"
        :key="product.id"
        :data-product-id="product.id"
      >
        <Link routeName="products.detail" :routeParams="{ id: product.id }">
          {{ product.name }}
        </Link>
        — ${{ product.price }}
      </li>
    </ul>
  </section>
</template>
