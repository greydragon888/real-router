<script setup lang="ts">
import { Link, useRoute } from "@real-router/vue";
import { computed } from "vue";

const ITEMS = [
  { id: "alpha", label: "Alpha", category: "letter" },
  { id: "bravo", label: "Bravo", category: "letter" },
  { id: "one", label: "One", category: "number" },
  { id: "two", label: "Two", category: "number" },
  { id: "red", label: "Red", category: "color" },
  { id: "blue", label: "Blue", category: "color" },
];

type Filter = "all" | "letter" | "number" | "color";
const FILTERS: Filter[] = ["all", "letter", "number", "color"];

const { route } = useRoute();

const filter = computed<Filter>(
  () => (route.value?.search.filter as Filter | undefined) ?? "all",
);

const visible = computed(() =>
  filter.value === "all"
    ? ITEMS
    : ITEMS.filter((item) => item.category === filter.value),
);
</script>

<template>
  <div data-route-root data-route-anim="fade">
    <h1>Query-only navigation</h1>
    <p>
      Changing the filter via query params is a same-route navigation
      (<code>route.name === nextRoute.name</code>).
      <code>useRouteExit</code> detects this via its default
      <code>skipSameRoute: true</code> and skips the page-level fade
      entirely — the page does not animate. <code>useListFlip</code>
      opts in via <code>skipSameRoute: false</code> to own the
      same-route window: items glide between positions, newcomers fade
      in, removed items fade out via ghost clones.
    </p>

    <div class="qd-toolbar">
      <Link
        v-for="value in FILTERS"
        :key="value"
        routeName="queryDemo"
        :routeSearch="{ filter: value }"
        :ignoreQueryParams="false"
      >
        {{ value }}
      </Link>
    </div>

    <ul class="qd-list">
      <li
        v-for="item in visible"
        :key="item.id"
        class="qd-item"
        :data-flip-key="item.id"
      >
        <strong>{{ item.label }}</strong>
        <span> — {{ item.category }}</span>
      </li>
    </ul>
  </div>
</template>
