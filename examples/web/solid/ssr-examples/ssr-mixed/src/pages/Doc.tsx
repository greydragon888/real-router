import { useRoute } from "@real-router/solid";
import { getSsrDataMode } from "@real-router/ssr-data-plugin";
import { Show, createSignal, onCleanup, onMount } from "solid-js";

import type { JSX } from "solid-js";

interface DocData {
  id: string;
  format: string;
  body: string;
}

export function Doc(): JSX.Element {
  const routeState = useRoute();
  const mode = (): "full" | "data-only" | "client-only" =>
    getSsrDataMode(routeState().route);
  const ssrData = (): DocData | undefined =>
    routeState().route.context.data as DocData | undefined;
  const [clientData, setClientData] = createSignal<DocData | null>(null);

  onMount(() => {
    if (mode() !== "client-only" || ssrData() !== undefined) return;

    const params = routeState().route.params;
    const search = routeState().route.search;
    const handle = setTimeout(() => {
      setClientData({
        id: String(params.id),
        format: String(search.format),
        body: `(client) PDF placeholder for ${String(params.id)}`,
      });
    }, 50);

    onCleanup(() => {
      clearTimeout(handle);
    });
  });

  const data = (): DocData | null | undefined => ssrData() ?? clientData();

  return (
    <main data-testid="doc">
      <h1>Doc (mode: {mode()})</h1>
      <Show
        when={data()}
        fallback={<p data-testid="doc-loading">Loading…</p>}
      >
        {(d) => (
          <div>
            <p data-testid="doc-id">id: {d().id}</p>
            <p data-testid="doc-format">format: {d().format}</p>
            <p data-testid="doc-body">{d().body}</p>
          </div>
        )}
      </Show>
    </main>
  );
}
