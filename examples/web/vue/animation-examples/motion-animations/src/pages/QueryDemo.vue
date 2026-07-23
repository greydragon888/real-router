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
  <div>
    <h1>Query-only navigation</h1>
    <p>
      Switch a filter — the page-level
      <code>&lt;Transition&gt;</code> does not exit/enter because
      filter changes are same-route
      (<code>route.name === nextRoute.name</code>) and
      <code>useRouteExit</code>'s default
      <code>skipSameRoute: true</code> short-circuits before the
      exitToken bumps. The <code>v-for</code> re-renders the visible
      items array in place. Vue's <code>&lt;Transition&gt;</code>
      does not ship list-layout primitives at this level — for
      animated list reorder in Vue, see
      <code>page-animations/</code> → <code>useListFlip</code> or
      Vue's built-in <code>&lt;TransitionGroup&gt;</code> for FLIP
      reorder.
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
      >
        <strong>{{ item.label }}</strong>
        <span> — {{ item.category }}</span>
      </li>
    </ul>
  </div>
</template>
