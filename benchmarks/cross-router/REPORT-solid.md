# Cross-Router Performance — Solid cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/solid` · `@solidjs/router` (the official Solid router) · `@tanstack/solid-router` — three full routers, like-for-like. Solid JSX apps (`vite-plugin-solid`, `dedupe: ['solid-js']`).

**Scope — three full routers, like-for-like** (no minimalist exclusion needed). The honest picture, DIFFERENT from the React/Vue cohorts: **`@solidjs/router` is a remarkably lean router** and leads the scale floor (wide), table-heap memory, cold-start, nav-churn heap, and active-links. **real-router leads the per-nav *totals*** — nav-latency (0.347, the leanest here), param-nav, nested-switch, link-build — where its lean script + single `pushState` beat @solidjs/router's 2× Blink history; and it brings the full pipeline (guards, validated search, data, scroll). Two adapter soft-spots surface: real-router's heaviest per-nav FLOOR at scale (transition pipeline + browser-plugin History), and **`@real-router/solid`'s deep-nesting `RouteView` cost (#1094 — now ~linear after a bench-app fix removed an O(depth²) getter-chain artifact: 1.07 ms @90)** — an adapter issue, not the (framework-agnostic, flat-capable) core. **`@tanstack/solid-router` is generally heaviest** and cannot render 60+-deep nested routes (errors).

**Run:** runs 30 · warmup 5 · throttle off · 2026-07-05T06:28:52.645Z · Apple M3 Pro · numbers are **median** (winner per row **bold**).

⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the stable signals — CPU (`script`), heap, FCP. Felt latency was dropped (render/frame-bound). **`nav-churn` navsPerSec is NOT comparable in this cohort** (real-router navigates synchronously; the others yield to frames) — read CPU/nav + heap. **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ (`history.pushState` ~identical across routers), so `script` ratios overstate the `total` per-nav gap.

## Cold start — `cold-start`

App init + parse/exec to first route painted. **@solidjs/router is the lightest to boot** (~2.6 ms script); **real-router is heaviest (~4.3 ms), tanstack ~3.8** — cold-start is real-router's known weak axis (eager `@real-router/core` parse + init, #1106; cross-cohort-consistent). Over the bare-Solid floor (~0.9 ms) all three add real startup, @solidjs/router the least.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| main-thread script (ms) | 4.32 | **2.64** | 3.84 |
| JS heap (MB) | 2.78 | **2.48** | 3.09 |
| FCP (ms) | 20.00 | **16.00** | 20.00 |

## Navigation — per-nav total main-thread (script + history) — `nav-latency`

Per-navigation total (script + Blink history), steady-state. **real-router is the leanest per-nav total** — it leads on *every* component (lowest script *and* tied-lowest Blink history), running well under tanstack and @solidjs/router. Unlike the Vue cohort (vue-router leanest), here real-router owns the lightest per-nav outright. *(Sub-ms — read ranking/ratio, not absolute ms; session/load-dependent.)*

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.390** | 0.641 | 0.464 |
| · script (V8 only) (ms) | **0.061** | 0.114 | 0.140 |
| · Blink history (pushState) (ms) | 0.328 | 0.524 | **0.325** |
| alloc / nav (GC pressure) (KB) | 0.081 | **0.063** | 1.86 |

## Param navigation — per-nav total (script + history) — `param-nav`

Per-nav total changing :id (steady-state). **real-router leanest total** — @solidjs/router's leaner *script* is more than offset by its 2× Blink `pushState` history, so on the honest total real-router wins (tanstack a close second). *(Sub-ms — session/load-dependent.)*

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.386** | 0.543 | 0.409 |
| · script (V8 only) (ms) | 0.070 | **0.064** | 0.088 |
| · Blink history (pushState) (ms) | **0.316** | 0.484 | 0.320 |
| alloc / nav (GC pressure) (KB) | 0.063 | **0.023** | 1.40 |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table. **All three matchers are FLAT** (no O(N) degradation): @solidjs/router total ~0.16, tanstack ~0.24, real-router ~0.38 across @10/@100/@1000. The differentiator is the per-nav FLOOR, not matcher scaling — **@solidjs/router's minimal pipeline is the leanest floor; real-router's full pipeline (transition + browser-plugin History) is the heaviest**, but flat. (Contrast React/Vue, where a competitor's matcher degrades O(N) and real-router's trie wins @1000 — here no competitor degrades, so the trie's structural edge doesn't separate them.)

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total @10 (ms) | 0.360 | **0.151** | 0.220 |
| ≈ total @100 (ms) | 0.325 | **0.139** | 0.217 |
| ≈ total @1000 (ms) | 0.339 | **0.145** | 0.215 |
| · script (matcher) @10 (ms) | 0.299 | **0.067** | 0.162 |
| · script (matcher) @100 (ms) | 0.266 | **0.066** | 0.162 |
| · script (matcher) @1000 (ms) | 0.278 | **0.069** | 0.158 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **@solidjs/router lightest at 10k (5.61 MB); real-router 8.27; tanstack heaviest (10.66).** Unlike the React/Vue cohorts (real-router's trie wins memory), @solidjs/router's minimal route storage is leaner here.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| heap @1 (floor) (MB) | 1.94 | **1.71** | 2.11 |
| heap @1k (MB) | 2.77 | **2.21** | 3.12 |
| heap @10k (MB) | 8.28 | **5.61** | 10.66 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain. **@solidjs/router stays flat (~0.16 total); real-router rises ~linearly — 0.47 → 1.07 ms @90** (script 0.41 → 1.01). The steep O(d²) rise seen in earlier runs was a **bench-app artifact** (an O(depth²) lazy-getter chain, since fixed) — the residual ~linear cost is **`@real-router/solid`'s `RouteView` per-level composition (#1094)**, not the core matcher (the Vue adapter keeps deep-nav flat at ~0.20 ms @90). **@tanstack/solid-router is N/A** — it triggers its internal error boundary on 60+-segment deep routes (the @tanstack/react-router equivalent renders depth 90). Real apps rarely nest past ~10, where the gap is ~0.3 ms.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total @3 (ms) | 0.465 | **0.136** | — |
| ≈ total @30 (ms) | 0.747 | **0.147** | — |
| ≈ total @60 (ms) | 0.790 | **0.156** | — |
| ≈ total @90 (ms) | 1.08 | **0.160** | — |
| · script (matcher) @3 (ms) | 0.402 | **0.062** | — |
| · script (matcher) @30 (ms) | 0.686 | **0.066** | — |
| · script (matcher) @60 (ms) | 0.723 | **0.068** | — |
| · script (matcher) @90 (ms) | 1.01 | **0.067** | — |

## Search-param scaling — query-param count (sweep, reads all values) — `search-param-scaling`

Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`, the realistic high-count vector), reading every value — and **this is where forcing materialization bites the lazy routers.** **real-router stays FLAT (~0.49 @50, slope ~0)** — eager immutable params. **@solidjs/router RISES — slope ~5.5 µs/param**: its `useSearchParams()` reactive store charges a reactive read per value, so @1 it crushes real-router (0.18 vs 0.49) but by @50 they **CONVERGE (0.46 ≈ 0.49)**. tanstack also rises (~3.6 µs/param). At the realistic high-count end the lazy advantage erodes to parity — real-router's eager snapshot is the flat, predictable cost (read once, cheap forever). **`alloc/nav`** (GC-pressure axis): real-router's eager params reference URL-parsed strings, so per-nav allocation stays **flat** with query count — the memory counterpart to the flat `script` curve (react-cohort probe: real-router the leanest allocator; parse/validate pipelines allocate O(count) garbage).

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total @1 (ms) | 0.408 | **0.143** | 0.239 |
| ≈ total @10 (ms) | 0.386 | **0.158** | 0.274 |
| ≈ total @50 (ms) | 0.419 | **0.399** | 0.418 |
| · script (query-parse) @1 (ms) | 0.348 | **0.066** | 0.184 |
| · script (query-parse) @10 (ms) | 0.330 | **0.084** | 0.222 |
| · script (query-parse) @50 (ms) | 0.356 | **0.308** | 0.358 |
| alloc / nav @50↔@1 (GC pressure) (KB) | 0.235 | **0.185** | 3.40 |

## Nav churn (stress) — `nav-churn`

200-nav stress; CPU/nav + retained heap. **real-router leanest CPU/nav — 0.35 total / 0.064 script per nav** (< tanstack 0.459 < @solidjs/router 0.534); **@solidjs/router retains the least heap (235 KB), real-router 299, tanstack 638.** `navsPerSec` is NOT comparable here: real-router navigates synchronously (churns 200 navs without yielding to frames → ~15k/s) while @solidjs/router + tanstack defer to the frame cadence (~121/s) — read CPU/nav + heap.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total / nav (ms) | **0.370** | 0.581 | 0.507 |
| · script / nav (V8) (ms) | **0.061** | 0.114 | 0.187 |
| · Blink / nav (pushState) (ms) | **0.309** | 0.464 | 0.315 |
| heap retained (200 navs) (KB) | 299 | **235** | 638 |
| throughput (frame-capped) (/s) | **15385** | 121 | 121 |

## Active links (100) — per-nav total (script + history) — `active-links`

Per-nav total recompute across 100 links (steady-state toggle). **All three tight (~1.3× spread, unlike React/Svelte/Angular's wide spread)** — real-router near the middle, tanstack and @solidjs/router bracketing it. @solidjs/router's `<A>` is inherently active-aware and Solid's fine-grained reactivity is already lean, so real-router's shared cached active-source **ties rather than wins here — near-parity, not a loss.** *(Sub-ms — exact order session/load-dependent.)*

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.396 | 0.465 | **0.375** |
| · script (V8 only) (ms) | 0.075 | **0.045** | 0.059 |
| · Blink history (pushState) (ms) | 0.324 | 0.419 | **0.316** |

## Link build — mount 1000 links (href construction) — `link-build`

CPU to mount 1000 links, each building its href. **real-router leanest (8.82 ms); @solidjs/router 9.93; tanstack ~3× (26.5).** Over the bare-`<a>` floor (1.9 ms) real-router adds the least reverse-matcher cost.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| script (1000 links) (ms) | **8.88** | 9.97 | 26.82 |

## Nested switch (reuse) — per-nav total (script + history) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **real-router leanest total — edging tanstack** (@solidjs/router a step back) on the honest per-nav-render total, consistent with its nav-latency / param-nav wins here. *(Sub-ms — session/load-dependent.)*

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.394** | 0.532 | 0.399 |
| · script (V8 only) (ms) | 0.077 | **0.054** | 0.082 |
| · Blink history (pushState) (ms) | 0.318 | 0.476 | **0.316** |

## Feature support — capability, NOT a perf race

Among three full routers, first-class API coverage differs. `✓` = built-in API, `N/A` = none (hand-rolled). Differentiators: `@solidjs/router` lacks validated search AND first-class scroll restoration — its leanness partly reflects a smaller surface.

| capability | real-router | solid-router | tanstack |
|---|---|---|---|
| Data on navigation (loader tied to route) | ✓ | ✓ | ✓ |
| Typed / validated search params (schema) | ✓ | N/A | ✓ |
| Blocking guard (canDeactivate / unsaved-changes) | ✓ | ✓ | ✓ |
| Built-in scroll restoration | ✓ | N/A | ✓ |

`✓` / `N/A` are API-verified against each router's surface (the in-harness `✓ⁱ` demo verification exists for the React cohort; `@real-router/solid` shares that pipeline; the `apps/solid/real-router/{data,search,guard}` demo apps exist as dogfooding — in-harness `✓ⁱ` for solid is a follow-up). `N/A` = feature-absence, not a speed loss.

**Reading:** real-router and tanstack cover all four axes; **`@solidjs/router` lacks validated search AND first-class scroll restoration** (raw query + hash-scroll). Its leanness in the perf tables partly reflects this smaller surface — a lean matcher-router vs a full pipeline. Perf and capability read together.

- **Data on navigation (loader tied to route)** — rr: `onEnter` + `lifecycle`/`preload` plugin · @solidjs/router: `preload` + `query`/`createAsync` · tanstack: `loader`
- **Typed / validated search params (schema)** — rr: `searchSchema` (zod) · @solidjs/router: raw `useSearchParams` only (no validation) · tanstack: `validateSearch` (zod)
- **Blocking guard (canDeactivate / unsaved-changes)** — rr: `canDeactivate` · @solidjs/router: `useBeforeLeave` · tanstack: `useBlocker`
- **Built-in scroll restoration** — rr: `<RouterProvider scrollRestoration>` · @solidjs/router: hash/top scroll only (no first-class saved-position restoration) · tanstack: `scrollRestoration: true`

## Router overhead over bare Solid (`_baseline`)

`_baseline` is the same pages with **no router** — manual `createSignal` + `history.pushState`, raw `<a>`. Subtract it and `+Δ` is each router's marginal cost.

| metric | bare Solid | real-router | solid-router | tanstack |
|---|---|---|---|---|
| cold-start script (ms) | 0.832 | 4.32 (+3.5) | 2.64 (+1.8) | 3.84 (+3.0) |
| cold-start heap (MB) | 2.29 | 2.78 (+0.5) | 2.48 (+0.2) | 3.09 (+0.8) |
| nav script (ms) | 0.036 | 0.061 (+0.0) | 0.114 (+0.1) | 0.140 (+0.1) |
| link-build script (ms) | 1.93 | 8.88 (+7.0) | 9.97 (+8.0) | 26.82 (+24.9) |

**Reading:** over bare Solid, all three add little on the hot path. real-router adds the least on navigation (nav-latency ≈ the floor) and links; @solidjs/router adds the least on cold-start. The separation is at scale (floor) and deep nesting (the adapter), not on the simple hot path.

## What this does NOT measure / caveats

- **No cross-framework ranking** — each column is the same framework (Solid); the delta is router work. (Do NOT compare to the React/Vue cohorts.)
- **`@tanstack/solid-router` deep-config is N/A** — it triggers its internal error boundary on 60+-segment deep-nested routes (renders depth 3/30, errors at 60/90). The `@tanstack/react-router` equivalent renders depth 90; a @tanstack/solid-router limitation, reproducible in-harness (`node cross-router/run.mjs deep-config tanstack solid`).
- **`@real-router/solid` deep-nesting rises O(depth)** — the `RouteView` composition cost, tracked as #1094 (an adapter issue; the core matcher is flat-capable, cf. the Vue cohort at ~0.24 ms @90). Real apps rarely nest past ~10.
- **`nav-churn` navsPerSec is NOT comparable** — real-router navigates synchronously (~14.7k/s), @solidjs/router + tanstack yield to frames (~123/s). Read CPU/nav + retained heap.
- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.
- `wide`/`deep` are scaling sweeps — the per-size *curve* matters (here wide is flat for all; deep separates real-router O(depth) from @solidjs/router flat).
- **Per-nav `script` medians sit near timer granularity** (Solid's per-nav work is sub-0.1 ms → inflated *relative* variance). At n=15 they are within the RME gate except one — `@solidjs/router` `nav-latency` `scriptDurationMs` (16.3%). The close per-nav *totals* (active-links, nested-switch) turn on differences inside that noise; the headline findings (cold-start heap, wide/deep sweeps, table-heap, nav-latency total) rest on stable, larger-magnitude signals (RME < ~5%).

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs solid`.

