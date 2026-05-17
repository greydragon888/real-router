---
"@real-router/vue": minor
---

`defer()` consumers + `/ssr` subpath split (#611)

Mirrors the React Stage 1 + Stage 0a roll-out (#609 / #610). Vue ships
three new SSR-feature exports under `@real-router/vue/ssr`:

- `useDeferred<T>(key)` — reads the promise published by the loader at
  `state.context.ssrDataDeferred[key]`.
- `<Await name="key">` — `defineComponent` with `async setup()` and a
  scoped slot exposing the resolved value.
- `<Streamed fallback>` — alias for native `<Suspense>` matching
  cross-adapter naming.

Idiom: `defineComponent` + `async setup()` + native `<Suspense>`.

**`<ClientOnly>` / `<ServerOnly>` migrated to `/ssr`**:

```diff
- import { ClientOnly, ServerOnly } from "@real-router/vue";
+ import { ClientOnly, ServerOnly } from "@real-router/vue/ssr";
```

**Wire-format**: consumes the NDJSON-shaped `<script>__rrDefer__("key",
json)</script>` settle scripts emitted by `@real-router/ssr-data-plugin/server`'s
`injectDeferredScripts` — server-side loaders return `defer({ critical,
deferred })` once.

**Streaming behaviour**: chunked HTTP, `<Suspense>` blocking (no OOO
placeholders) — 🟡 DX-only — formal API.

**Breaking change** (pre-1.0, allowed in `minor`): `ClientOnly`/`ServerOnly`
removed from main entry.
