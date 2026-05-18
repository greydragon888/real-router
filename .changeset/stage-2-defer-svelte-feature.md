---
"@real-router/svelte": minor
---

`defer()` consumers + `/ssr` subpath split (#611)

Mirrors the React Stage 1 + Stage 0a roll-out (#609 / #610). Svelte ships
three new SSR-feature exports under `@real-router/svelte/ssr`:

- `useDeferred<T>(key)` — reads the promise published by the loader at
  `state.context.ssrDataDeferred[key]`.
- `<Await>` — `.svelte` component wrapping the native `{#await}` block
  for ergonomic deferred-payload rendering.
- `<Streamed>` — `.svelte` component matching cross-adapter naming.

Idiom: Native `{#await}` block + Svelte 5 runes.

**`<ClientOnly>` / `<ServerOnly>` migrated to `/ssr`**:

```diff
- import { ClientOnly, ServerOnly } from "@real-router/svelte";
+ import { ClientOnly, ServerOnly } from "@real-router/svelte/ssr";
```

**Wire-format**: consumes the NDJSON-shaped `<script>__rrDefer__("key",
json)</script>` settle scripts emitted by `@real-router/ssr-data-plugin/server`'s
`injectDeferredScripts` — server-side loaders return `defer({ critical,
deferred })` once.

**Streaming behaviour**: no progressive HTTP-flush — 🟡 DX-only — formal
API ready for Svelte 6+ streaming.

**Breaking change** (pre-1.0, allowed in `minor`): `ClientOnly`/`ServerOnly`
removed from main entry.
