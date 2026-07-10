# Cross-Router Performance — Solid cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/solid` · `@solidjs/router` (the official Solid router) · `@tanstack/solid-router` — three full routers, like-for-like. Solid JSX apps (`vite-plugin-solid`, `dedupe: ['solid-js']`).

**Scope — three full routers, like-for-like** (no minimalist exclusion needed). The honest picture, DIFFERENT from the React/Vue cohorts: **`@solidjs/router` is a remarkably lean router** and leads the scale floor (wide), table-heap memory, cold-start, nav-churn heap, and active-links. **real-router leads the per-nav *totals*** — nav-latency (0.344, the leanest here), param-nav, nested-switch, link-build — where its lean script + single `pushState` beat @solidjs/router's 2× Blink history; and it brings the full pipeline (guards, validated search, data, scroll). Two adapter soft-spots surface: real-router's heaviest per-nav FLOOR at scale (transition pipeline + browser-plugin History), and **`@real-router/solid`'s deep-nesting `RouteView` cost (#1094 — now ~linear after a bench-app fix removed an O(depth²) getter-chain artifact: 1.04 ms @90)** — an adapter issue, not the (framework-agnostic, flat-capable) core. **`@tanstack/solid-router` is generally heaviest** and cannot render 60+-deep nested routes (errors).

**Run:** runs 50 · warmup 5 · throttle off · 2026-07-09T17:09:30.678Z · Apple M3 Pro · numbers are **median** (winner per row **bold**).

⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the stable signals — CPU (`script`), heap, FCP. Felt latency was dropped (render/frame-bound). **`nav-churn` navsPerSec is NOT comparable in this cohort** (real-router navigates synchronously; the others yield to frames) — read CPU/nav + heap. **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ (`history.pushState` ~identical across routers), so `script` ratios overstate the `total` per-nav gap.

## Cold start — `cold-start`

App init + parse/exec to first route painted. **@solidjs/router is the lightest to boot** (~2.6 ms script); **real-router is heaviest (~4.4 ms), tanstack ~3.8** — cold-start is real-router's known weak axis (eager `@real-router/core` parse + init, #1106; cross-cohort-consistent). Over the bare-Solid floor (~0.9 ms) all three add real startup, @solidjs/router the least.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| main-thread script (ms) | 4.47 | **2.63** | 3.79 |
| JS heap (MB) | 2.81 | **2.48** | 3.09 |
| FCP (ms) | 20.00 | **16.00** | 20.00 |

## Navigation — per-nav total main-thread (script + history) — `nav-latency`

Per-navigation total (script + Blink history), steady-state. **real-router is the leanest per-nav total** — it leads on *every* component (lowest script *and* tied-lowest Blink history), running well under tanstack and @solidjs/router. Unlike the Vue cohort (vue-router leanest), here real-router owns the lightest per-nav outright. *(Sub-ms — read ranking/ratio, not absolute ms; session/load-dependent.)*

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.372** | 0.548 | 0.429 |
| · script (V8 only) (ms) | **0.062** | 0.082 | 0.134 |
| · Blink history (pushState) (ms) | 0.311 | 0.464 | **0.296** |
| alloc / nav (GC pressure) (KB) | 0.081 | **0.061** | 1.87 |

## Param navigation — per-nav total (script + history) — `param-nav`

Per-nav total changing :id (steady-state). **real-router leanest total** — @solidjs/router's leaner *script* is more than offset by its 2× Blink `pushState` history, so on the honest total real-router wins (tanstack a close second). *(Sub-ms — session/load-dependent.)*

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.368** | 0.534 | 0.383 |
| · script (V8 only) (ms) | 0.072 | **0.058** | 0.087 |
| · Blink history (pushState) (ms) | **0.295** | 0.479 | 0.297 |
| alloc / nav (GC pressure) (KB) | 0.064 | **0.023** | 1.38 |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table. **All three matchers are FLAT** (no O(N) degradation): @solidjs/router total ~0.15, tanstack ~0.21, real-router ~0.33 across @10/@100/@1000. The differentiator is the per-nav FLOOR, not matcher scaling — **@solidjs/router's minimal pipeline is the leanest floor; real-router's full pipeline (transition + browser-plugin History) is the heaviest**, but flat. (Contrast React/Vue, where a competitor's matcher degrades O(N) and real-router's trie wins @1000 — here no competitor degrades, so the trie's structural edge doesn't separate them.)

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total @10 (ms) | 0.367 | **0.147** | 0.210 |
| ≈ total @100 (ms) | 0.337 | **0.142** | 0.215 |
| ≈ total @1000 (ms) | 0.335 | **0.146** | 0.209 |
| · script (matcher) @10 (ms) | 0.305 | **0.066** | 0.153 |
| · script (matcher) @100 (ms) | 0.282 | **0.065** | 0.161 |
| · script (matcher) @1000 (ms) | 0.274 | **0.068** | 0.155 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **@solidjs/router lightest at 10k (5.61 MB); real-router 8.30; tanstack heaviest (10.66).** Unlike the React/Vue cohorts (real-router's trie wins memory), @solidjs/router's minimal route storage is leaner here.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| heap @1 (floor) (MB) | 1.96 | **1.71** | 2.11 |
| heap @1k (MB) | 2.83 | **2.21** | 3.12 |
| heap @10k (MB) | 8.33 | **5.61** | 10.66 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain. **@solidjs/router stays flat (~0.15 total); real-router rises ~linearly — 0.46 → 1.04 ms @90** (script 0.40 → 0.98). The steep O(d²) rise seen in earlier runs was a **bench-app artifact** (an O(depth²) lazy-getter chain, since fixed) — the residual ~linear cost is **`@real-router/solid`'s `RouteView` per-level composition (#1094)**, not the core matcher (the Vue adapter keeps deep-nav flat at ~0.20 ms @90). **@tanstack/solid-router is N/A** — it triggers its internal error boundary on 60+-segment deep routes (the @tanstack/react-router equivalent renders depth 90). Real apps rarely nest past ~10, where the gap is ~0.3 ms.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total @3 (ms) | 0.469 | **0.134** | — |
| ≈ total @30 (ms) | 0.741 | **0.141** | — |
| ≈ total @60 (ms) | 0.774 | **0.151** | — |
| ≈ total @90 (ms) | 1.02 | **0.157** | — |
| · script (matcher) @3 (ms) | 0.409 | **0.060** | — |
| · script (matcher) @30 (ms) | 0.676 | **0.065** | — |
| · script (matcher) @60 (ms) | 0.712 | **0.066** | — |
| · script (matcher) @90 (ms) | 0.967 | **0.067** | — |

## Search-param scaling — query-param count (sweep, reads all values) — `search-param-scaling`

Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`, the realistic high-count vector), reading every value — and **this is where forcing materialization bites the lazy routers.** **real-router stays FLAT (~0.40 @50, slope ~0)** — eager immutable params. **@solidjs/router RISES — slope ~5 µs/param**: its `useSearchParams()` reactive store charges a reactive read per value, so @1 it crushes real-router (0.14 vs 0.40) but by @50 they **CONVERGE (0.39 ≈ 0.40)**. tanstack also rises (~3.7 µs/param). At the realistic high-count end the lazy advantage erodes to parity — real-router's eager snapshot is the flat, predictable cost (read once, cheap forever). **`alloc/nav`** (GC-pressure axis): real-router's eager params reference URL-parsed strings, so per-nav allocation stays **flat** with query count — the memory counterpart to the flat `script` curve (react-cohort probe: real-router the leanest allocator; parse/validate pipelines allocate O(count) garbage).

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total @1 (ms) | 0.412 | **0.140** | 0.239 |
| ≈ total @10 (ms) | 0.382 | **0.159** | 0.268 |
| ≈ total @50 (ms) | 0.400 | **0.390** | 0.416 |
| · script (query-parse) @1 (ms) | 0.351 | **0.065** | 0.184 |
| · script (query-parse) @10 (ms) | 0.321 | **0.084** | 0.215 |
| · script (query-parse) @50 (ms) | 0.340 | **0.305** | 0.357 |
| alloc / nav @50↔@1 (GC pressure) (KB) | 0.230 | **0.173** | 3.39 |

## Nav churn (stress) — `nav-churn`

200-nav stress; CPU/nav + retained heap. **real-router leanest CPU/nav — 0.32 total / 0.061 script per nav** (< tanstack 0.44 < @solidjs/router 0.52); **@solidjs/router retains the least heap (235 KB), real-router 299, tanstack 638.** `navsPerSec` is NOT comparable here: real-router navigates synchronously (churns 200 navs without yielding to frames → ~15k/s) while @solidjs/router + tanstack defer to the frame cadence (~121/s) — read CPU/nav + heap.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total / nav (ms) | **0.345** | 0.550 | 0.467 |
| · script / nav (V8) (ms) | **0.063** | 0.090 | 0.173 |
| · Blink / nav (pushState) (ms) | **0.282** | 0.460 | 0.292 |
| heap retained (200 navs) (KB) | 309 | **235** | 638 |
| throughput (frame-capped) (/s) | **15095** | 121 | 121 |

## Active links (100) — per-nav total (script + history) — `active-links`

Per-nav total recompute across 100 links (steady-state toggle). **All three tight (~1.3× spread, unlike React/Svelte/Angular's wide spread)** — real-router near the middle, tanstack and @solidjs/router bracketing it. @solidjs/router's `<A>` is inherently active-aware and Solid's fine-grained reactivity is already lean, so real-router's shared cached active-source **ties rather than wins here — near-parity, not a loss.** *(Sub-ms — exact order session/load-dependent.)*

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.383 | 0.460 | **0.369** |
| · script (V8 only) (ms) | 0.077 | **0.043** | 0.058 |
| · Blink history (pushState) (ms) | **0.307** | 0.415 | 0.311 |

## Back / forward — per-nav total, browser history traversal (popstate) — `back-forward`

Browser **back/forward** (popstate) steady-state. **@solidjs/router leanest (~1.05 ms) — real-router #2 (~1.17, +12%), tanstack ~2.35.** **#1353** (skip no-op popstate `replaceState`) narrowed real-router's gap from **~68% to ~12%** — now near-competitive with @solidjs/router's minimal single-popstate. real-router the **leanest allocator of all** (~0.05 KB/nav). *(n=15.)*

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | 1.17 | **1.05** | 2.35 |
| · script (V8 only) (ms) | 0.274 | 0.078 | **0.040** |
| · Blink history (popstate) (ms) | **0.908** | 0.963 | 2.31 |
| alloc / nav (GC pressure) (KB) | **0.055** | 0.062 | 1.88 |

## Link build — mount 1000 links (href construction) — `link-build`

CPU to mount 1000 links, each building its href. **real-router leanest (8.74 ms); @solidjs/router 9.91; tanstack ~3× (26.3).** Over the bare-`<a>` floor (1.9 ms) real-router adds the least reverse-matcher cost.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| script (1000 links) (ms) | **8.77** | 9.79 | 26.39 |

## Nested switch (reuse) — per-nav total (script + history) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **real-router leanest total — edging tanstack** (@solidjs/router a step back) on the honest per-nav-render total, consistent with its nav-latency / param-nav wins here. *(Sub-ms — session/load-dependent.)*

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.372** | 0.526 | 0.377 |
| · script (V8 only) (ms) | 0.078 | **0.053** | 0.080 |
| · Blink history (pushState) (ms) | **0.294** | 0.476 | 0.299 |

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
| cold-start script (ms) | 0.805 | 4.47 (+3.7) | 2.63 (+1.8) | 3.79 (+3.0) |
| cold-start heap (MB) | 2.29 | 2.81 (+0.5) | 2.48 (+0.2) | 3.09 (+0.8) |
| link-build script (ms) | 1.92 | 8.77 (+6.8) | 9.79 (+7.9) | 26.39 (+24.5) |

**Reading:** over bare Solid, all three add little. real-router adds the least on links; @solidjs/router adds the least on cold-start. The separation is at scale (floor) and deep nesting (the adapter), not on the simple hot path. (Per-nav is ranked router-vs-router in the tables above — real-router leads nav-latency here.)

## What this does NOT measure / caveats

- **No cross-framework ranking** — each column is the same framework (Solid); the delta is router work. (Do NOT compare to the React/Vue cohorts.)
- **`@tanstack/solid-router` deep-config is N/A** — it triggers its internal error boundary on 60+-segment deep-nested routes (renders depth 3/30, errors at 60/90). The `@tanstack/react-router` equivalent renders depth 90; a @tanstack/solid-router limitation, reproducible in-harness (`node cross-router/run.mjs deep-config tanstack solid`).
- **`@real-router/solid` deep-nesting rises O(depth)** — the `RouteView` composition cost, tracked as #1094 (an adapter issue; the core matcher is flat-capable, cf. the Vue cohort at ~0.24 ms @90). Real apps rarely nest past ~10.
- **`nav-churn` navsPerSec is NOT comparable** — real-router navigates synchronously (~14.7k/s), @solidjs/router + tanstack yield to frames (~123/s). Read CPU/nav + retained heap.
- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.
- `wide`/`deep` are scaling sweeps — the per-size *curve* matters (here wide is flat for all; deep separates real-router O(depth) from @solidjs/router flat).
- **Per-nav `script` medians sit near timer granularity** (Solid's per-nav work is sub-0.1 ms → inflated *relative* variance). At n=30 they all sit within the RME gate (worst: `@solidjs/router` `nav-latency` `scriptDurationMs`, ~7%). The close per-nav *totals* (active-links, nested-switch) turn on differences inside that noise; the headline findings (cold-start heap, wide/deep sweeps, table-heap, nav-latency total) rest on stable, larger-magnitude signals (RME < ~5%).

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs solid`.

