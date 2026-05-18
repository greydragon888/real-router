<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

interface DashboardData {
  alerts: number;
  tickets: number;
}

const data = ref<DashboardData | null>(null);
let handle: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  // Simulates a client-side fetch — server skipped the loader because of
  // `ssr: false`, so we fetch (or compute) the data here on hydration.
  handle = setTimeout(() => {
    data.value = { alerts: 3, tickets: 12 };
  }, 50);
});

onUnmounted(() => {
  if (handle !== undefined) clearTimeout(handle);
});
</script>

<template>
  <main data-testid="admin-dashboard">
    <h1>Admin dashboard (client-only)</h1>
    <p v-if="data === null" data-testid="admin-loading">Loading…</p>
    <p v-else data-testid="admin-data">
      {{ data.alerts }} alerts, {{ data.tickets }} open tickets
    </p>
  </main>
</template>
