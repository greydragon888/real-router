<script setup lang="ts">
import { Link, useRoute } from "@real-router/vue";
import { computed, ref } from "vue";

import { useListFlip } from "../use-list-flip";
import { useRouteAnimation } from "../use-route-animation";

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

const root = ref<HTMLDivElement | null>(null);
const list = ref<HTMLUListElement | null>(null);

useRouteAnimation(root, {
  entryClass: "slide-in",
  exitClass: "slide-out",
});

useListFlip(list);

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
  <div ref="root">
    <h1>Products</h1>
    <p>
      Click a product to see the detail. Each page (this list and the
      detail) registers its own <code>useRouteAnimation</code>
      composable on its wrapper — slide-out for the list's exit,
      fade-in for the detail's entry, no shared shell, no centralised
      policy.
    </p>

    <div class="products-toolbar">
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

    <ul ref="list" class="product-list">
      <li
        v-for="product in items"
        :key="product.id"
        :data-flip-key="product.id"
        class="product-card"
      >
        <Link
          routeName="products.detail"
          :routeParams="{ id: product.id }"
        >
          <span
            class="product-thumb"
            :style="{ backgroundColor: product.color }"
            aria-hidden="true"
          />
          <span class="product-name">{{ product.name }}</span>
        </Link>
      </li>
    </ul>
  </div>
</template>
