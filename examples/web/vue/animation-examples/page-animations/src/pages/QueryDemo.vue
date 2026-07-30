<script setup lang="ts">
import { Link, useRoute } from "@real-router/vue";
import { computed, ref } from "vue";

import { useListFlip } from "../use-list-flip";
import { useRouteAnimation } from "../use-route-animation";

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

const root = ref<HTMLDivElement | null>(null);
const list = ref<HTMLUListElement | null>(null);

useRouteAnimation(root, { entryClass: "fade-in", exitClass: "fade-out" });
useListFlip(list);

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
  <div ref="root">
    <h1>Query-only navigation</h1>
    <p>
      Click a filter — the page itself does not fade because the
      composable's default <code>skipSameRoute: true</code>
      short-circuits when
      <code>route.name === nextRoute.name</code>. Three coordinated
      WAAPI animations play instead, all driven by
      <code>useListFlip</code>: survivors translate from old to new
      positions (inverse-FLIP from a
      <code>getBoundingClientRect</code> diff in
      <code>watch(route)</code>); newly-visible items fade in; items
      removed by a narrowing filter fade out via cloned ghosts
      reconstructed from <code>outerHTML</code> and pinned at their
      last-known rect. View-local — no router events, no shared state
      between components.
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

    <ul ref="list" class="qd-list">
      <li
        v-for="item in visible"
        :key="item.id"
        :data-flip-key="item.id"
        class="qd-item"
      >
        <strong>{{ item.label }}</strong>
        <span> — {{ item.category }}</span>
      </li>
    </ul>
  </div>
</template>
