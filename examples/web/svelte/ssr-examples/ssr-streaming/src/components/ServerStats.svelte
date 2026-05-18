<script lang="ts">
  // Top-level `await` in <script>. Requires `experimental.async: true`
  // in Svelte 5.54.x (gated until the feature graduates to stable; see
  // svelte.config.js + vite.config.ts). The parent's <svelte:boundary>
  // wraps this component; while the await resolves, the boundary's
  // `pending` snippet shows.
  //
  // **Empirically verified behaviour in Svelte 5.54**: server-side does
  // NOT block on the top-level await. The SSR response ships the
  // boundary's `pending` snippet (NOT the resolved component), and the
  // client materializes the resolved content after hydration. This is
  // the SAME runtime behaviour as `{#await}` in template. The practical
  // difference is **author ergonomics**: `{#await}` lives in the
  // template; top-level await lets the rest of the script use the
  // resolved value as an ordinary variable.
  //
  // The 250 ms server-side delay would matter only if a future Svelte
  // release switched to "server waits before flush" semantics. The
  // boundary-pending e2e test (Scenario 16) pins the current behaviour
  // so a regression there is honest.

  interface ProductStats {
    productId: string;
    views: number;
    rating: number;
  }

  const STATS_BY_PRODUCT: Record<string, ProductStats> = {
    "1": { productId: "1", views: 18432, rating: 4.7 },
    "2": { productId: "2", views: 9201, rating: 4.4 },
    "3": { productId: "3", views: 27109, rating: 4.9 },
    "4": { productId: "4", views: 12, rating: 1.2 },
    "5": { productId: "5", views: 3, rating: 0 },
  };

  const SERVER_STATS_DELAY_MS = 250;

  function fetchStats(productId: string): Promise<ProductStats> {
    const stats = STATS_BY_PRODUCT[productId] ?? {
      productId,
      views: 0,
      rating: 0,
    };

    if (typeof globalThis.window === "undefined") {
      // Server: simulate a database query. render() awaits us before
      // emitting HTML, so the resolved data lands in the SSR response.
      return new Promise((resolve) =>
        setTimeout(() => resolve(stats), SERVER_STATS_DELAY_MS),
      );
    }

    // Client: resolve synchronously so the pending snippet doesn't flash.
    return Promise.resolve(stats);
  }

  const props: { productId: string } = $props();
  const stats = await fetchStats(props.productId);
</script>

<section data-testid="server-stats">
  <h3>Stats (loaded via top-level await)</h3>
  <p data-testid="stats-views">{stats.views.toLocaleString()} views</p>
  <p data-testid="stats-rating">Rating: {stats.rating.toFixed(1)}/5</p>
</section>
