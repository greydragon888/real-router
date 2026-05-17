---
"@real-router/preact": minor
---

`defer()` consumers + `/ssr` subpath split (#611)

Mirrors the React Stage 1 + Stage 0a roll-out (#609 / #610). Preact ships
three new SSR-feature exports under `@real-router/preact/ssr`:

- `useDeferred<T>(key)` — reads the promise published by the loader at
  `state.context.ssrDataDeferred[key]`. Stable promise reference across
  renders within one navigation.
- `<Await name="key">{(value) => …}</Await>` — thenable-throwing wrapper
  that integrates with `preact/compat` `<Suspense>` (Preact has no
  `use(promise)` analogue, so the implementation throws the pending
  promise directly).
- `<Streamed fallback={…}>{children}</Streamed>` — alias for `<Suspense>`
  matching cross-adapter naming.

Idiom: `useState`/`useEffect` + `preact/compat` `<Suspense>` + thenable-
throwing `<Await>`.

**`<ClientOnly>` / `<ServerOnly>` migrated to `/ssr`**:

```diff
- import { ClientOnly, ServerOnly } from "@real-router/preact";
+ import { ClientOnly, ServerOnly } from "@real-router/preact/ssr";
```

**Wire-format**: consumes the NDJSON-shaped `<script>__rrDefer__("key",
json)</script>` settle scripts emitted by `@real-router/ssr-data-plugin/server`'s
`injectDeferredScripts` — server-side loaders return `defer({ critical,
deferred })` once.

**Streaming behaviour**: `<preact-island>` swap on `lazy()` boundaries —
🟡 DX + limited capability.

**Breaking change** (pre-1.0, allowed in `minor`): `ClientOnly`/`ServerOnly`
removed from main entry.
