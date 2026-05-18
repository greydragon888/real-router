import { useEffect, useState } from "react";

interface DashboardData {
  alerts: number;
  tickets: number;
}

export function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    // Simulates a client-side fetch — server skipped the loader because of
    // `ssr: false`, so we fetch (or compute) the data here on hydration.
    const handle = setTimeout(() => {
      setData({ alerts: 3, tickets: 12 });
    }, 50);

    return () => {
      clearTimeout(handle);
    };
  }, []);

  return (
    <main data-testid="admin-dashboard">
      <h1>Admin dashboard (client-only)</h1>
      {data === null ? (
        <p data-testid="admin-loading">Loading…</p>
      ) : (
        <p data-testid="admin-data">
          {data.alerts} alerts, {data.tickets} open tickets
        </p>
      )}
    </main>
  );
}
