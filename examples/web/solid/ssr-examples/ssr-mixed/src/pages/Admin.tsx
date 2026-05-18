import { Show, createSignal, onCleanup, onMount } from "solid-js";

import type { JSX } from "solid-js";

interface DashboardData {
  alerts: number;
  tickets: number;
}

export function AdminDashboard(): JSX.Element {
  const [data, setData] = createSignal<DashboardData | null>(null);

  onMount(() => {
    // Simulates a client-side fetch — server skipped the loader because of
    // `ssr: false`, so we fetch (or compute) the data here on hydration.
    const handle = setTimeout(() => {
      setData({ alerts: 3, tickets: 12 });
    }, 50);

    onCleanup(() => {
      clearTimeout(handle);
    });
  });

  return (
    <main data-testid="admin-dashboard">
      <h1>Admin dashboard (client-only)</h1>
      <Show
        when={data()}
        fallback={<p data-testid="admin-loading">Loading…</p>}
      >
        {(d) => (
          <p data-testid="admin-data">
            {d().alerts} alerts, {d().tickets} open tickets
          </p>
        )}
      </Show>
    </main>
  );
}
