---
"@real-router/svelte": minor
---

Add `<HttpStatusCode code={N}/>` + `<HttpStatusProvider>` + `createHttpStatusSink()` to `/ssr` (#611)

Render-time HTTP status declaration for SSR. Svelte 5-native idioms (`setContext` / `getContext`). The sink write happens at component init via `getContext`, no DOM is rendered.

```svelte
<script lang="ts">
  import {
    HttpStatusProvider,
    createHttpStatusSink,
  } from "@real-router/svelte/ssr";

  const sink = createHttpStatusSink();
</script>

<HttpStatusProvider {sink}>
  {#snippet children()}
    <App />
  {/snippet}
</HttpStatusProvider>

<!-- inside NotFound.svelte -->
<HttpStatusCode code={404} />
```
