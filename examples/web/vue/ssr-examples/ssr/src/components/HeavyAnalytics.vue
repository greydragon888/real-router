<script setup lang="ts">
import { onMounted, ref } from "vue";

// Heavy below-the-fold component used to demonstrate Vue 3.5's lazy
// hydration. SSR renders the full HTML (counter at 0, button text)
// — search-engine crawlers and JS-disabled clients see everything.
// Hydration is deferred until the component scrolls into view via
// `defineAsyncComponent({ hydrate: hydrateOnVisible() })` on the
// consumer side. Until then:
//   - onMounted does NOT run (window.__LAZY_HYDRATED_AT__ stays
//     undefined)
//   - reactive state is frozen (clicking the button does nothing —
//     no event handler attached yet)
//   - a11y / DOM is fully visible
//
// Pure savings: the JS for this component (and its onMounted/event
// handlers) is loaded + executed only when the user actually sees it.
// Maps to Angular's @defer (on viewport) + withIncrementalHydration().

const count = ref(0);

onMounted(() => {
  // Stamp the moment hydration completes — e2e suite reads this to
  // verify hydration was deferred AND eventually fired.
  (
    window as Window & { __LAZY_HYDRATED_AT__?: number }
  ).__LAZY_HYDRATED_AT__ = Date.now();
});

function increment(): void {
  count.value++;
}
</script>

<template>
  <section
    data-testid="heavy-analytics"
    style="margin-top: 2400px; padding: 1rem; border: 1px solid #ccc"
  >
    <h2>Heavy Analytics (lazy-hydrated)</h2>
    <p>
      Below-the-fold component, server-rendered eagerly but hydrated only
      when scrolled into view.
    </p>
    <button
      type="button"
      data-testid="heavy-counter"
      @click="increment"
    >
      Clicked: {{ count }}
    </button>
  </section>
</template>
