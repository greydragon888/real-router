<script setup lang="ts">
import { defineAsyncComponent, hydrateOnVisible } from "vue";

import SearchForm from "../components/SearchForm.vue";

// Vue 3.5 lazy hydration: server fully renders the component, client
// defers hydration until the strategy fires. `hydrateOnVisible()`
// uses IntersectionObserver internally — the component hydrates the
// first time it scrolls into view (or immediately if already visible
// at mount time, e.g. on a short page).
//
// Other strategies available out of the box:
//   - hydrateOnIdle()           — requestIdleCallback
//   - hydrateOnInteraction(...) — first click/focus/keydown/etc
//   - hydrateOnMediaQuery(...)  — matches a CSS media query
//   - custom hydration function — full control
//
// Constraint: must be wrapped via defineAsyncComponent (the loader
// is the unit that gets code-split + lazy-hydrated together). Sync
// components and components nested inside an async component cannot
// have their own hydration strategy.
const HeavyAnalytics = defineAsyncComponent({
  loader: () => import("../components/HeavyAnalytics.vue"),
  hydrate: hydrateOnVisible(),
});
</script>

<template>
  <div>
    <h1>Welcome</h1>
    <p>Real-Router SSR example with Vue 3 and Vite.</p>

    <SearchForm />

    <HeavyAnalytics />
  </div>
</template>
