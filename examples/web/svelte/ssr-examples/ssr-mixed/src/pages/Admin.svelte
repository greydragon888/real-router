<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  interface DashboardData {
    alerts: number;
    tickets: number;
  }

  let data = $state<DashboardData | null>(null);
  let handle: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    // Simulates a client-side fetch — server skipped the loader because of
    // `ssr: false`, so we fetch (or compute) the data here on hydration.
    handle = setTimeout(() => {
      data = { alerts: 3, tickets: 12 };
    }, 50);
  });

  onDestroy(() => {
    if (handle !== undefined) clearTimeout(handle);
  });
</script>

<main data-testid="admin-dashboard">
  <h1>Admin dashboard (client-only)</h1>
  {#if data === null}
    <p data-testid="admin-loading">Loading…</p>
  {:else}
    <p data-testid="admin-data">
      {data.alerts} alerts, {data.tickets} open tickets
    </p>
  {/if}
</main>
