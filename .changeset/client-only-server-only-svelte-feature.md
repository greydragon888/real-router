---
"@real-router/svelte": minor
---

Add `<ClientOnly>` and `<ServerOnly>` SSR-aware components (#604)

Two paired components for opt-in client/server rendering boundaries.
Both use `$state` + `$effect` — `$effect` is browser-only, so the
server emits the SSR-side branch (fallback for `<ClientOnly>`, children
for `<ServerOnly>`). After hydration the rune flips and the `{#if}` /
`{#else if}` branch swaps.

```svelte
<script lang="ts">
  import { ClientOnly, ServerOnly } from "@real-router/svelte";
</script>

<ClientOnly>
  {#snippet children()}
    <BrowserApiWidget />
  {/snippet}
  {#snippet fallback()}
    <Skeleton />
  {/snippet}
</ClientOnly>
```
