import { useRoute, useRouter } from "@real-router/preact";
import { invalidate } from "@real-router/ssr-data-plugin";

interface HomeData {
  greeting: string;
  fetchedAt: number;
  aborts: number;
}

export function Home() {
  const { route } = useRoute();
  const router = useRouter();
  const data = route.context.data as HomeData | undefined;

  // Escape hatch: mark "data" stale, then trigger a same-route reload.
  // Reload bypasses stabilizeState dedupe (#605), so useRoute() re-renders
  // with the fresh snapshot written by the plugin's subscribeLeave handler.
  const handleRefresh = (): void => {
    invalidate(router, "data");
    void router.navigate(route.name, route.params, undefined, {
      reload: true,
    });
  };

  return (
    <main data-testid="home">
      <h1>Home (full SSR)</h1>
      <p data-testid="greeting">{data?.greeting ?? "(no data)"}</p>
      {data?.fetchedAt !== undefined && (
        <p data-testid="fetched-at">{String(data.fetchedAt)}</p>
      )}
      {data?.aborts !== undefined && (
        <p data-testid="aborts">{String(data.aborts)}</p>
      )}
      <button
        type="button"
        data-testid="refresh-btn"
        onClick={handleRefresh}
      >
        Refresh data
      </button>
    </main>
  );
}
