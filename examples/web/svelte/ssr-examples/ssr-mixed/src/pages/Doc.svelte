<script lang="ts">
  import { useRoute } from "@real-router/svelte";
  import { getSsrDataMode } from "@real-router/ssr-data-plugin";
  import { onDestroy, onMount } from "svelte";

  interface DocData {
    id: string;
    format: string;
    body: string;
  }

  const { route } = useRoute();
  const mode = $derived(getSsrDataMode(route.current));
  const ssrData = $derived(route.current.context.data as DocData | undefined);
  let clientData = $state<DocData | null>(null);
  let handle: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    if (mode !== "client-only" || ssrData !== undefined) return;

    const params = route.current.params;
    const search = route.current.search;
    handle = setTimeout(() => {
      clientData = {
        id: String(params.id),
        format: String(search.format),
        body: `(client) PDF placeholder for ${String(params.id)}`,
      };
    }, 50);
  });

  onDestroy(() => {
    if (handle !== undefined) clearTimeout(handle);
  });

  const data = $derived(ssrData ?? clientData);
</script>

<main data-testid="doc">
  <h1>Doc (mode: {mode})</h1>
  {#if !data}
    <p data-testid="doc-loading">Loading…</p>
  {:else}
    <div>
      <p data-testid="doc-id">id: {data.id}</p>
      <p data-testid="doc-format">format: {data.format}</p>
      <p data-testid="doc-body">{data.body}</p>
    </div>
  {/if}
</main>
