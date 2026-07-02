# Cross-Router Performance — Solid cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/solid` · `@solidjs/router` (the official Solid router) · `@tanstack/solid-router` — three full routers, like-for-like. Solid JSX apps (`vite-plugin-solid`, `dedupe: ['solid-js']`).

**Scope — three full routers, like-for-like** (no minimalist exclusion needed). The honest picture, DIFFERENT from the React/Vue cohorts: **`@solidjs/router` is a remarkably lean router** and leads most raw numbers — cold-start heap, param-nav, the wide/param-scaling floor, deep (flat), table-heap memory, nav-churn heap. **real-router leads the pipeline-light per-nav metrics** — nav-latency (0.262, the leanest per-nav total here), link-build, active-links — and brings the full pipeline (guards, validated search, data, scroll). Two adapter soft-spots surface: real-router's heaviest per-nav FLOOR at scale (transition pipeline + browser-plugin History), and **`@real-router/solid`'s deep-nesting `RouteView` cost rising O(depth) (#1094)** — an adapter issue, not the (framework-agnostic, flat-capable) core. **`@tanstack/solid-router` is generally heaviest** and cannot render 60+-deep nested routes (errors).

**Run:** runs 10 · warmup 5 · throttle off · 2026-07-02T05:13:10.165Z · Apple M3 Pro · numbers are **median** (winner per row **bold**).

⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the stable signals — CPU (`script`), heap, FCP. Felt latency was dropped (render/frame-bound). **`nav-churn` navsPerSec is NOT comparable in this cohort** (real-router navigates synchronously; the others yield to frames) — read CPU/nav + heap. **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ (`history.pushState` ~identical across routers), so `script` ratios overstate the `total` per-nav gap.

## Cold start — `cold-start`

App init + parse/exec to first route painted. **@solidjs/router is the lightest to boot** (heap 2.48 MB, script 2.80 ms); real-router middle (2.78 / 4.54), tanstack heaviest (3.09 / 4.12). Over the bare-Solid floor (2.29 MB heap / 0.88 ms) all three add little.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| main-thread script (ms) | 4.54 | **2.80** | 4.12 |
| JS heap (MB) | 2.78 | **2.48** | 3.09 |
| FCP (ms) | 20.00 | **16.00** | 20.00 |

## Navigation — per-nav total main-thread (script + history) — `nav-latency`

Per-navigation total (script + Blink history), steady-state. **real-router is the leanest per-nav total — 0.262 ms** (< tanstack 0.315 < @solidjs/router 0.336), essentially the bare-Solid floor (0.246). This *inverts* the raw `script` order (real-router 0.078 > @solidjs/router 0.066): @solidjs/router's leaner script is offset by heavier Blink history, so on the honest total real-router edges it. Unlike the Vue cohort (vue-router leanest), here real-router owns the lightest per-nav.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.262** | 0.336 | 0.315 |
| · script (V8 only) (ms) | 0.078 | **0.066** | 0.108 |
| · Blink history (pushState) (ms) | **0.184** | 0.283 | 0.197 |

## Param navigation — per-nav total (script + history) — `param-nav`

Per-nav total changing :id (steady-state). **@solidjs/router (0.243) ≈ tanstack (0.245) lead; real-router 0.302** — the ~3× script gap (rr 0.15 vs @solidjs/router 0.045) shrinks to ~1.25× on total.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.302 | **0.243** | 0.245 |
| · script (V8 only) (ms) | 0.150 | **0.045** | 0.127 |
| · Blink history (pushState) (ms) | 0.160 | 0.184 | **0.147** |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table. **All three matchers are FLAT** (no O(N) degradation): @solidjs/router total ~0.16, tanstack ~0.24, real-router ~0.38 across @10/@100/@1000. The differentiator is the per-nav FLOOR, not matcher scaling — **@solidjs/router's minimal pipeline is the leanest floor; real-router's full pipeline (transition + browser-plugin History) is the heaviest**, but flat. (Contrast React/Vue, where a competitor's matcher degrades O(N) and real-router's trie wins @1000 — here no competitor degrades, so the trie's structural edge doesn't separate them.)

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total @10 (ms) | 0.406 | **0.174** | 0.253 |
| ≈ total @100 (ms) | 0.365 | **0.154** | 0.258 |
| ≈ total @1000 (ms) | 0.375 | **0.157** | 0.243 |
| · script (matcher) @10 (ms) | 0.335 | **0.080** | 0.187 |
| · script (matcher) @100 (ms) | 0.302 | **0.074** | 0.194 |
| · script (matcher) @1000 (ms) | 0.306 | **0.074** | 0.175 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **@solidjs/router lightest at 10k (5.61 MB); real-router 8.27; tanstack heaviest (10.66).** Unlike the React/Vue cohorts (real-router's trie wins memory), @solidjs/router's minimal route storage is leaner here.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| heap @1 (floor) (MB) | 1.94 | **1.71** | 2.11 |
| heap @1k (MB) | 2.77 | **2.21** | 3.12 |
| heap @10k (MB) | 8.27 | **5.61** | 10.66 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain. **@solidjs/router stays flat (~0.17 total); real-router rises O(depth) — 0.56 → 6.40 ms @90** (script 0.49 → 6.33). The core segment-trie matcher is O(depth) but cheap (the Vue adapter keeps deep-nav flat at ~0.24 ms @90); the steep rise here is **`@real-router/solid`'s `RouteView` deep-composition cost — a per-level re-render scaling with depth (#1094)**, not the core matcher. **@tanstack/solid-router is N/A** — it triggers its internal error boundary on 60+-segment deep routes (the @tanstack/react-router equivalent renders depth 90). Real apps rarely nest past ~10, where the gap is ~1 ms.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total @3 (ms) | 0.560 | **0.148** | — |
| ≈ total @30 (ms) | 1.28 | **0.166** | — |
| ≈ total @60 (ms) | 2.86 | **0.171** | — |
| ≈ total @90 (ms) | 6.40 | **0.173** | — |
| · script (matcher) @3 (ms) | 0.487 | **0.068** | — |
| · script (matcher) @30 (ms) | 1.21 | **0.076** | — |
| · script (matcher) @60 (ms) | 2.80 | **0.073** | — |
| · script (matcher) @90 (ms) | 6.33 | **0.077** | — |

## Param scaling — path-param count (sweep) — `param-scaling`

Routes with 1 / 10 / 100 path params — floor-bound (matcher barely stressed). **@solidjs/router leanest (~0.17 total, flat); real-router ~0.44–0.52; tanstack ~0.26–0.29.** Param count ~a non-factor for all; the gap is the per-nav floor, not param extraction.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total @1 (ms) | 0.442 | **0.166** | 0.256 |
| ≈ total @10 (ms) | 0.408 | **0.163** | 0.266 |
| ≈ total @100 (ms) | 0.523 | **0.172** | 0.286 |
| · script (matcher) @1 (ms) | 0.372 | **0.074** | 0.191 |
| · script (matcher) @10 (ms) | 0.348 | **0.080** | 0.199 |
| · script (matcher) @100 (ms) | 0.451 | **0.074** | 0.221 |

## Nav churn (stress) — `nav-churn`

200-nav stress; CPU/nav + retained heap. **CPU/nav is tight — real-router 0.063 ≈ @solidjs/router 0.065, tanstack ~2× (0.118); @solidjs/router retains the least heap (235 KB), real-router 315, tanstack 635.** `navsPerSec` is NOT comparable here: real-router navigates synchronously (churns 200 navs without yielding to frames → ~14.7k/s) while @solidjs/router + tanstack defer to the frame cadence (~123/s) — read CPU/nav + heap.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total / nav (ms) | **0.248** | 0.260 | 0.306 |
| · script / nav (V8) (ms) | **0.063** | 0.065 | 0.118 |
| · Blink / nav (pushState) (ms) | **0.182** | 0.195 | 0.188 |
| heap retained (200 navs) (KB) | 315 | **235** | 635 |
| throughput (frame-capped) (/s) | **14707** | 124 | 123 |

## Active links (100) — per-nav total (script + history) — `active-links`

Per-nav total recompute across 100 links (steady-state toggle). **All three tight — real-router 0.219 ≈ @solidjs/router 0.223 < tanstack 0.234** (unlike the React cohort's wide spread). @solidjs/router's `<A>` is inherently active-aware; real-router recomputes a cached active-source per link.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.219** | 0.223 | 0.234 |
| · script (V8 only) (ms) | 0.074 | **0.040** | 0.075 |
| · Blink history (pushState) (ms) | **0.143** | 0.187 | 0.146 |

## Link build — mount 1000 links (href construction) — `link-build`

CPU to mount 1000 links, each building its href. **real-router leanest (9.4 ms); @solidjs/router 10.3; tanstack ~3× (29.1).** Over the bare-`<a>` floor (2.0 ms) real-router adds the least reverse-matcher cost.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| script (1000 links) (ms) | **9.38** | 10.31 | 29.10 |

## Nested switch (reuse) — per-nav total (script + history) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **tanstack leanest here (0.249), @solidjs/router 0.323, real-router 0.357** — one of the few per-nav-render metrics real-router trails (the adapter floor again, cf. deep-config).

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.357 | 0.323 | **0.249** |
| · script (V8 only) (ms) | 0.168 | **0.051** | 0.159 |
| · Blink history (pushState) (ms) | 0.180 | 0.270 | **0.090** |

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
| cold-start script (ms) | 0.878 | 4.54 (+3.7) | 2.80 (+1.9) | 4.12 (+3.2) |
| cold-start heap (MB) | 2.29 | 2.78 (+0.5) | 2.48 (+0.2) | 3.09 (+0.8) |
| nav script (ms) | 0.036 | 0.078 (+0.0) | 0.066 (+0.0) | 0.108 (+0.1) |
| link-build script (ms) | 1.99 | 9.38 (+7.4) | 10.31 (+8.3) | 29.10 (+27.1) |

**Reading:** over bare Solid, all three add little on the hot path. real-router adds the least on navigation (nav-latency ≈ the floor) and links; @solidjs/router adds the least on cold-start. The separation is at scale (floor) and deep nesting (the adapter), not on the simple hot path.

## What this does NOT measure / caveats

- **No cross-framework ranking** — each column is the same framework (Solid); the delta is router work. (Do NOT compare to the React/Vue cohorts.)
- **`@tanstack/solid-router` deep-config is N/A** — it triggers its internal error boundary on 60+-segment deep-nested routes (renders depth 3/30, errors at 60/90). The `@tanstack/react-router` equivalent renders depth 90; a @tanstack/solid-router limitation, reproducible in-harness (`node cross-router/run.mjs deep-config tanstack solid`).
- **`@real-router/solid` deep-nesting rises O(depth)** — the `RouteView` composition cost, tracked as #1094 (an adapter issue; the core matcher is flat-capable, cf. the Vue cohort at ~0.24 ms @90). Real apps rarely nest past ~10.
- **`nav-churn` navsPerSec is NOT comparable** — real-router navigates synchronously (~14.7k/s), @solidjs/router + tanstack yield to frames (~123/s). Read CPU/nav + retained heap.
- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.
- `wide`/`deep`/`param-scaling` are scaling sweeps — the per-size *curve* matters (here wide/param are flat for all; deep separates real-router O(depth) from @solidjs/router flat).
- **Elevated RME on the close per-nav scenarios (n=10)** — `active-links`, `param-nav`, `nested-switch` per-nav `script` medians carry RME ~15–23% because Solid's per-nav work is sub-0.1 ms (near timer granularity → inflated *relative* variance). Their conclusion is 'all three ~tight' precisely because the differences sit inside that noise; the headline findings (cold-start heap, wide/deep/param sweeps, table-heap, nav-latency total) rest on stable, larger-magnitude signals (RME < ~5%).

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs solid`.

