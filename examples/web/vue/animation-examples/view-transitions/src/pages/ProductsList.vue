<script setup lang="ts">
import { Link, useRoute } from "@real-router/vue";
import { computed } from "vue";

interface Product {
  id: string;
  name: string;
  color: string;
}

const PRODUCTS: Product[] = [
  { id: "1", name: "Crimson Flask", color: "#b91c1c" },
  { id: "2", name: "Azure Orb", color: "#1d4ed8" },
  { id: "3", name: "Emerald Prism", color: "#047857" },
  { id: "4", name: "Amber Cube", color: "#b45309" },
  { id: "5", name: "Violet Sphere", color: "#6d28d9" },
  { id: "6", name: "Slate Block", color: "#334155" },
];

type SortDirection = "asc" | "desc";

const { route } = useRoute();

const sort = computed<SortDirection>(() =>
  route.value?.search.sort === "desc" ? "desc" : "asc",
);

const items = computed(() => {
  const sorted = PRODUCTS.toSorted((left, right) =>
    left.name.localeCompare(right.name),
  );

  return sort.value === "desc" ? sorted.toReversed() : sorted;
});
</script>

<template>
  <div class="vt-products-toolbar">
    <span>Sort:</span>
    <Link
      routeName="products"
      :routeSearch="{ sort: 'asc' }"
      :ignoreQueryParams="false"
    >
      A → Z
    </Link>
    {{ " · " }}
    <Link
      routeName="products"
      :routeSearch="{ sort: 'desc' }"
      :ignoreQueryParams="false"
    >
      Z → A
    </Link>
    {{ " · " }}
    <strong>current: {{ sort }}</strong>
  </div>

  <ul class="vt-product-list" data-vt-scope="product-list">
    <li
      v-for="product in items"
      :key="product.id"
      class="vt-product-card"
      :style="{ '--vt-card-name': `vt-card-${product.id}` }"
    >
      <Link
        routeName="products.detail"
        :routeParams="{ id: product.id }"
      >
        <span
          class="vt-product-thumb"
          :data-product-id="product.id"
          :style="{ backgroundColor: product.color }"
          aria-hidden="true"
        />
        <span class="vt-product-name">{{ product.name }}</span>
      </Link>
    </li>
  </ul>
</template>
