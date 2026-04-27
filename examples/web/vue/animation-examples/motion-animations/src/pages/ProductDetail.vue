<script setup lang="ts">
import { Link, useRoute } from "@real-router/vue";
import { computed } from "vue";

const COVERS: Partial<Record<string, { name: string; color: string }>> = {
  1: { name: "Crimson Flask", color: "#b91c1c" },
  2: { name: "Azure Orb", color: "#1d4ed8" },
  3: { name: "Emerald Prism", color: "#047857" },
  4: { name: "Amber Cube", color: "#b45309" },
  5: { name: "Violet Sphere", color: "#6d28d9" },
  6: { name: "Slate Block", color: "#334155" },
};

const { route } = useRoute<{ id: string }>();
const id = computed(() => route.value?.params.id ?? "1");
const product = computed(() => COVERS[id.value]);
</script>

<template>
  <div v-if="product">
    <h2>{{ product.name }}</h2>
    <div
      class="product-cover"
      :style="{ backgroundColor: product.color }"
      aria-hidden="true"
    />
    <p>
      Note: no library-driven hero morph here. Vue's built-in
      <code>&lt;Transition&gt;</code> is per-element entry/exit only —
      it does not pair elements across the route boundary. For an
      inverse-FLIP hero morph in Vue, see
      <code>route-animations/</code> → <code>useHeroMorph</code>:
      capture rect on <code>useRouteExit</code>, animate via WAAPI on
      <code>navigator.subscribe</code>.
    </p>
    <p>
      <Link routeName="products" activeStrict>
        ← Back to products
      </Link>
    </p>
  </div>
  <div v-else>
    <h2>Unknown product</h2>
    <Link routeName="products" activeStrict>
      Back to products
    </Link>
  </div>
</template>
