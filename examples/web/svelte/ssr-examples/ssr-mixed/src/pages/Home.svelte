<script lang="ts">
  import { useRoute, useRouter } from "@real-router/svelte";
  import { invalidate } from "@real-router/ssr-data-plugin";

  interface HomeData {
    greeting: string;
    fetchedAt: number;
    aborts: number;
  }

  const { route } = useRoute();
  const router = useRouter();
  const data = $derived(route.current.context.data as HomeData | undefined);

  // Escape hatch: mark "data" stale, then trigger a same-route reload.
  // Reload bypasses stabilizeState dedupe (#605), so useRoute() re-emits
  // the fresh snapshot written by the plugin's subscribeLeave handler.
  function handleRefresh(): void {
    const current = route.current;

    invalidate(router, "data");
    void router.navigate(current.name, current.params, current.search, { reload: true });
  }
</script>

<main data-testid="home">
  <h1>Home (full SSR)</h1>
  <p data-testid="greeting">{data?.greeting ?? "(no data)"}</p>
  {#if data?.fetchedAt !== undefined}
    <p data-testid="fetched-at">{data.fetchedAt}</p>
  {/if}
  {#if data?.aborts !== undefined}
    <p data-testid="aborts">{data.aborts}</p>
  {/if}
  <button type="button" data-testid="refresh-btn" onclick={handleRefresh}>
    Refresh data
  </button>
</main>
