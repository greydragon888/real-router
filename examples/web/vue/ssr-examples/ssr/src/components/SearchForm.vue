<script setup lang="ts">
import { useId, ref } from "vue";

// Vue 3.5's `useId()` returns a stable per-component-instance ID.
// On SSR, every render produces deterministic IDs; the client
// hydration walker sees the same IDs and matches them, so label[for]
// pointers don't break across the SSR→CSR boundary.
//
// Why hand-rolled IDs (Math.random, counter++, crypto.randomUUID)
// fail under SSR:
//   - Math.random differs between server and client → hydration
//     mismatch warnings.
//   - A module-level counter resets between requests on long-lived
//     workers, but worse: the SAME counter advances per request
//     across concurrent renders, leaking state.
//   - crypto.randomUUID changes per call.
//
// useId() solves all three: deterministic, per-instance, request-
// isolated. Maps to React's useId / Solid's createUniqueId.
const queryId = useId();
const sortId = useId();
const query = ref("");
const sort = ref<"asc" | "desc">("asc");
</script>

<template>
  <form data-testid="search-form" @submit.prevent>
    <fieldset>
      <legend>Search</legend>

      <div>
        <label :for="queryId" data-testid="query-label">Search query</label>
        <input
          :id="queryId"
          v-model="query"
          type="text"
          data-testid="query-input"
        />
      </div>

      <div>
        <label :for="sortId" data-testid="sort-label">Sort order</label>
        <select :id="sortId" v-model="sort" data-testid="sort-select">
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>
    </fieldset>
  </form>
</template>
