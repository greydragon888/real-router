import { useRoute } from "@real-router/solid";
import { getSsrDataMode } from "@real-router/ssr-data-plugin";
import { Show, createSignal, onCleanup, onMount } from "solid-js";

import type { JSX } from "solid-js";

interface DocumentData {
  id: string;
  format: string;
  body: string;
}

export function DocumentPage(): JSX.Element {
  const routeState = useRoute();
  const mode = (): "full" | "data-only" | "client-only" =>
    getSsrDataMode(routeState().route);
  const ssrData = (): DocumentData | undefined =>
    routeState().route.context.data as DocumentData | undefined;
  const [clientData, setClientData] = createSignal<DocumentData | null>(null);

  onMount(() => {
    if (mode() !== "client-only" || ssrData() !== undefined) {
      return;
    }

    const params = routeState().route.params;
    const search = routeState().route.search;
    const handle = setTimeout(() => {
      setClientData({
        id: params.id as string,
        format: search.format as string,
        body: `(client) PDF placeholder for ${params.id as string}`,
      });
    }, 50);

    onCleanup(() => {
      clearTimeout(handle);
    });
  });

  const data = (): DocumentData | null | undefined => ssrData() ?? clientData();

  return (
    <main data-testid="doc">
      <h1>Doc (mode: {mode()})</h1>
      <Show when={data()} fallback={<p data-testid="doc-loading">Loading…</p>}>
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
