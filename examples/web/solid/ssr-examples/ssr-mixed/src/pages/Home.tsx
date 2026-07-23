import { useRoute, useRouter } from "@real-router/solid";
import { invalidate } from "@real-router/ssr-data-plugin";
import { Show } from "solid-js";

import type { JSX } from "solid-js";

interface HomeData {
  greeting: string;
  fetchedAt: number;
  aborts: number;
}

export function Home(): JSX.Element {
  const routeState = useRoute();
  const router = useRouter();
  const data = (): HomeData | undefined =>
    routeState().route.context.data as HomeData | undefined;

  // Escape hatch: mark "data" stale, then trigger a same-route reload.
  // Reload bypasses stabilizeState dedupe (#605), so useRoute() re-emits
  // the fresh snapshot written by the plugin's subscribeLeave handler.
  const handleRefresh = (): void => {
    const current = routeState().route;

    invalidate(router, "data");
    void router.navigate(current.name, current.params, undefined, {
      reload: true,
    });
  };

  return (
    <main data-testid="home">
      <h1>Home (full SSR)</h1>
      <p data-testid="greeting">{data()?.greeting ?? "(no data)"}</p>
      <Show when={data()?.fetchedAt !== undefined}>
        <p data-testid="fetched-at">{String(data()?.fetchedAt)}</p>
      </Show>
      <Show when={data()?.aborts !== undefined}>
        <p data-testid="aborts">{String(data()?.aborts)}</p>
      </Show>
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
