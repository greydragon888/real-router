---
"@real-router/solid": minor
---

`defer()` consumers + `/ssr` subpath split (#611)

Mirrors the React Stage 1 + Stage 0a roll-out (#609 / #610). Solid ships
three new SSR-feature exports under `@real-router/solid/ssr`:

- `useDeferred<T>(key)` — returns `Accessor<Promise<T>>` reading the
  promise published by the loader at `state.context.ssrDataDeferred[key]`.
- `<Await name="key">{(value) => …}</Await>` — wraps `createResource` for
  ergonomic deferred-payload rendering.
- `<Streamed fallback={…}>{children}</Streamed>` — alias for native
  `<Suspense>` matching cross-adapter naming.

Idiom: `createResource` + native `<Suspense>`.

**`<ClientOnly>` / `<ServerOnly>` migrated to `/ssr`**:

```diff
- import { ClientOnly, ServerOnly } from "@real-router/solid";
+ import { ClientOnly, ServerOnly } from "@real-router/solid/ssr";
```

**Wire-format**: consumes the NDJSON-shaped `<script>__rrDefer__("key",
json)</script>` settle scripts emitted by `@real-router/ssr-data-plugin/server`'s
`injectDeferredScripts` — server-side loaders return `defer({ critical,
deferred })` once.

**Streaming behaviour**: true OOO via splice scripts — 🟢 capability + DX.

**Breaking change** (pre-1.0, allowed in `minor`): `ClientOnly`/`ServerOnly`
removed from main entry.
