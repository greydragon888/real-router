<script setup lang="ts">
import { ClientOnly, ServerOnly } from "@real-router/vue/ssr";
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

    <!-- Dogfooding: <ClientOnly> + <ServerOnly> SSR boundaries. -->
    <section aria-labelledby="ssr-boundaries-heading">
      <h2 id="ssr-boundaries-heading">SSR boundaries</h2>
      <ClientOnly>
        <p data-testid="ssr-boundaries-client">Mounted on the client</p>
        <template #fallback>
          <p data-testid="ssr-boundaries-client-fallback">
            Loading client widget…
          </p>
        </template>
      </ClientOnly>
      <ServerOnly>
        <p data-testid="ssr-boundaries-server">
          Server-only content (e.g. SEO meta, zero-JS notice)
        </p>
        <template #fallback>
          <p data-testid="ssr-boundaries-server-fallback">
            Hidden after hydration
          </p>
        </template>
      </ServerOnly>
    </section>
  </div>
</template>
