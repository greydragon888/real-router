import { createResource, Suspense } from "solid-js";

import type { JSX } from "solid-js";

interface ServerStat {
  visitors: number;
  uptime: string;
}

const SERVER_STATS_DELAY_MS = 500;

function fetchStats(): Promise<ServerStat> {
  if (typeof globalThis.window === "undefined") {
    // Server-side delay simulates a database query that the page must
    // wait for before rendering. With renderToStringAsync, the entire
    // SSR response blocks until this Promise resolves — output is a
    // single buffered string, NOT progressive chunks.
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ visitors: 12_345, uptime: "99.97%" });
      }, SERVER_STATS_DELAY_MS);
    });
  }

  // Client: resolve synchronously so the Suspense fallback doesn't
  // flash during hydration.
  return Promise.resolve({ visitors: 12_345, uptime: "99.97%" });
}

function ServerStats(): JSX.Element {
  const [stats] = createResource(fetchStats);

  return (
    <section data-testid="async-stats">
      <p>Visitors: {stats()?.visitors.toLocaleString()}</p>
      <p>Uptime: {stats()?.uptime}</p>
    </section>
  );
}

// Demonstrates Solid's third SSR mode: `renderToStringAsync`. Unlike
// `renderToString` (sync, ignores Suspense — ships the fallback) and
// `renderToStream` (chunks resolved Suspense boundaries progressively),
// `renderToStringAsync` awaits all Suspense, then returns a single
// buffered HTML string. Useful for CDN-cacheable async pages where you
// want the full document but don't need streaming.
//
// Empirical test: response body contains "Visitors: 12,345" (resolved
// content), NOT "loading…" (the fallback). Response timing is at least
// the server delay (~500 ms) to prove the await happened.
export function AsyncPage(): JSX.Element {
  return (
    <div data-testid="async-page">
      <h2>Async page (renderToStringAsync demo)</h2>
      <p>
        Page-level data fetched via Suspense + createResource on the server.
      </p>
      <Suspense
        fallback={<p data-testid="async-stats-fallback">Loading stats…</p>}
      >
        <ServerStats />
      </Suspense>
    </div>
  );
}
