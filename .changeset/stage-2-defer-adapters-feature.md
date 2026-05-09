---
"@real-router/preact": minor
"@real-router/solid": minor
"@real-router/vue": minor
"@real-router/svelte": minor
"@real-router/angular": minor
---

Stage 2 — `defer()` consumers + `/ssr` subpath split across the remaining 5 adapters (#611)

Mirrors the React Stage 1 + Stage 0a roll-out (#609 / #610) across Preact,
Solid, Vue, Svelte, and Angular. Each adapter ships:

| Adapter | New SSR-feature exports | Subpath | Idiom |
|---|---|---|---|
| **Preact** | `useDeferred`, `<Await>`, `<Streamed>` | `@real-router/preact/ssr` | `useState`/`useEffect` + `preact/compat` `<Suspense>` + thenable-throwing `<Await>` (Preact has no `use(promise)` analogue) |
| **Solid** | `useDeferred` (returns `Accessor<Promise<T>>`), `<Await>`, `<Streamed>` | `@real-router/solid/ssr` | `createResource` + native `<Suspense>` |
| **Vue** | `useDeferred`, `<Await>` (`async setup` + scoped slot), `<Streamed>` | `@real-router/vue/ssr` | `defineComponent` + `async setup()` + native `<Suspense>` |
| **Svelte** | `useDeferred`, `<Await>` + `<Streamed>` (.svelte components) | `@real-router/svelte/ssr` | Native `{#await}` block + Svelte 5 runes |
| **Angular** | `injectDeferred(key)` returning `Signal<T \| undefined>` | `@real-router/angular/ssr` | Signals + `effect()` + `@if`/`async` pipe; no `<Await>`/`<Streamed>` (Angular uses different control flow) |

For React 18-style legacy entries (Preact, Solid, Vue, Svelte don't ship one),
the SSR-feature surface lives only at `/ssr`.

**`<ClientOnly>` / `<ServerOnly>` migrated to `/ssr` for all 5 adapters**
(Angular shipped via ng-packagr secondary entry-point at `packages/angular/ssr/`).
Re-import:

```diff
- import { ClientOnly, ServerOnly } from "@real-router/preact";
+ import { ClientOnly, ServerOnly } from "@real-router/preact/ssr";

- import { ClientOnly, ServerOnly } from "@real-router/solid";
+ import { ClientOnly, ServerOnly } from "@real-router/solid/ssr";

- import { ClientOnly, ServerOnly } from "@real-router/vue";
+ import { ClientOnly, ServerOnly } from "@real-router/vue/ssr";

- import { ClientOnly, ServerOnly } from "@real-router/svelte";
+ import { ClientOnly, ServerOnly } from "@real-router/svelte/ssr";

- import { ClientOnly, ServerOnly } from "@real-router/angular";
+ import { ClientOnly, ServerOnly } from "@real-router/angular/ssr";
```

**Wire-format parity:** all five adapters consume the same NDJSON-shaped
`<script>__rrDefer__("key", json)</script>` settle scripts emitted by
`@real-router/ssr-data-plugin/server`'s `injectDeferredScripts` — server-side
loaders return `defer({ critical, deferred })` once and every adapter reads
`state.context.ssrDataDeferred[key]` via its native idiom.

**Streaming behaviour by adapter** (per `.claude/SSR_FEATURE_GAPS_RU.md` §7
ROI table):

| Adapter | HTTP-flush behaviour | What `defer()` gives |
|---|---|---|
| React 19 | true OOO + selective hydration | 🟢 capability + DX |
| Solid 1.x | true OOO via splice scripts | 🟢 capability + DX |
| Vue 3 | chunked HTTP, `<Suspense>` blocking (no OOO placeholders) | 🟡 DX-only — formal API |
| Preact 10 | `<preact-island>` swap on `lazy()` boundaries | 🟡 DX + limited capability |
| Svelte 5 | no progressive HTTP-flush | 🟡 DX-only — formal API ready for Svelte 6+ streaming |
| Angular 21 | no server-streaming, incremental hydration on the client | 🟡 DX-only — `injectDeferred` ready for future framework streaming |

**Breaking change** (pre-1.0, allowed in `minor`): all 5 adapters remove
`ClientOnly`/`ServerOnly` from main entry. Angular additionally moves
`injectDeferred` to `/ssr` (3 SSR-feature exports trigger the split).

**Dogfooding follow-up:** the per-adapter `ssr-streaming/` examples will be
refactored to use `defer()` + `useDeferred()` in a follow-up PR to keep this
changeset focused on the API surface; the React `ssr-streaming/` example
already demonstrates the end-to-end flow from Stage 1.
