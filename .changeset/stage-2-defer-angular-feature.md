---
"@real-router/angular": minor
---

`defer()` consumers + `/ssr` subpath split (#611)

Mirrors the React Stage 1 + Stage 0a roll-out (#609 / #610). Angular ships
via ng-packagr secondary entry-point at `packages/angular/ssr/`:

- `injectDeferred(key)` — returns `Signal<T | undefined>` reading the
  promise published by the loader at `state.context.ssrDataDeferred[key]`.

No `<Await>` / `<Streamed>` — Angular uses different control flow
(`@if` / `async` pipe + signals).

Idiom: Signals + `effect()` + `@if` / `async` pipe.

**`<ClientOnly>` / `<ServerOnly>` migrated to `/ssr`**:

```diff
- import { ClientOnly, ServerOnly } from "@real-router/angular";
+ import { ClientOnly, ServerOnly } from "@real-router/angular/ssr";
```

The 3-SSR-feature-export threshold (per `.claude/SSR_FEATURE_GAPS_RU.md`
§8) is reached with `injectDeferred` + `ClientOnly` + `ServerOnly` —
triggers the subpath split for Angular.

**Wire-format**: consumes the NDJSON-shaped `<script>__rrDefer__("key",
json)</script>` settle scripts emitted by `@real-router/ssr-data-plugin/server`'s
`injectDeferredScripts` — server-side loaders return `defer({ critical,
deferred })` once.

**Streaming behaviour**: no server-streaming, incremental hydration on
the client — 🟡 DX-only — `injectDeferred` ready for future framework
streaming.

**Breaking change** (pre-1.0, allowed in `minor`): `ClientOnly`/`ServerOnly`
removed from main entry; `injectDeferred` lives at `/ssr` only.
