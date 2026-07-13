# Cross-Router Performance — Solid cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/solid` · `@solidjs/router` (the official Solid router) · `@tanstack/solid-router` — three full routers, like-for-like. Solid JSX apps (`vite-plugin-solid`, `dedupe: ['solid-js']`).

**Scope — three full routers, like-for-like** (no minimalist exclusion needed). The honest picture, updated on the n=50 metric: **`@solidjs/router` is a remarkably lean router** — it leads cold-start, table-heap memory, and nav-churn retained heap. But **real-router leads far more than the earlier read suggested:** it wins nav-latency, param-nav, nested-switch, back-forward (~tie), link-build, active-links (~3.4×), **wide-config @1000 (~2.4×, @solidjs/router degrades with N — not flat at scale)** and **deep-config (every depth, ~1.4× @90)** — plus it brings the full pipeline (guards, validated search, data, scroll). One adapter soft-spot remains: **`@real-router/solid`'s deep-nesting `RouteView` cost (#1094 — ~linear after a bench-app fix removed an O(depth²) getter-chain artifact)**, though it still beats @solidjs/router's deep curve. **`@tanstack/solid-router` is generally heaviest** and cannot render 60+-deep nested routes (errors).

**Run:** runs 50 · warmup 5 · throttle off · 2026-07-12T19:27:30.480Z · 322efbdf-dirty · Apple M3 Pro · numbers are **median** (winner per row **bold**; a **⚖** row = the top-2 medians' 95% CIs overlap, so no winner is bolded — not statistically separable, #1460).

⚠️ Preliminary local numbers — directional, not a published verdict. Per-nav is **wall** (click→DOM settle — felt) + **task** (ΔTaskDuration — CPU), RME < 3% at n=50; the `total = script + Blink` metric was **retired** (#1451/#1452); `script`/`blink` are ⚠ **diagnostics** (V8-only, microtask-blind). **`nav-churn` navsPerSec is NOT comparable in this cohort** (real-router navigates synchronously; the others yield to frames) — read CPU/nav + heap.

## Cold start — `cold-start`

App init + parse/exec to first route painted. **@solidjs/router is the lightest to boot** (~2.61 ms script); **real-router is heaviest (~4.57 ms), tanstack ~3.80** — cold-start is real-router's known weak axis (eager `@real-router/core` parse + init, #1106; cross-cohort-consistent). Over the bare-Solid floor (~0.9 ms) all three add real startup, @solidjs/router the least.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| main-thread script (ms) | 4.57 | **2.61** | 3.80 |
| JS heap (retained, post-GC) (MB) | 2.05 | **1.78** | 2.22 |
| · JS heap @FCP (pre-GC, boot garbage — diag #1454) (MB) | 2.81 | **2.48** | 3.10 |
| FCP (ms) | 20.00 | **16.00** | 20.00 |

## Navigation — per-nav wall-clock (click→DOM settle) — `nav-latency`

Per-nav **wall** (click→DOM settle, felt) + **task** (ΔTaskDuration, CPU). **real-router is the leanest per-nav — wall 0.065 vs @solidjs/router 0.110 (~69%), tanstack 0.390** — it wins wall *and* task outright (unlike the Vue cohort, where the native router's reactivity leads the `script` diagnostic). *(Sub-ms — read ranking/ratio, not absolute ms.)* `alloc/nav`: real-router leanest (~7 KB vs @solidjs/router 12 / tanstack 165).

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| nav / wall (click→settle) (ms) | **0.065** | 0.110 | 0.390 |
| · nav / task (ΔTaskDuration) (ms) | **0.082** | 0.118 | 0.400 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | 0.062 | **0.010** | 0.030 |
| · blink diag (gap=0, #1452) (ms) ⚖ | 0.023 | 0.043 | 0.023 |
| alloc / nav (GC pressure) (KB) | **7.36** | 12.22 | 165 |

## Param navigation — per-nav wall-clock (click→DOM settle) — `param-nav`

Per-nav wall + task changing :id (steady-state). **real-router leanest — wall 0.077 vs @solidjs/router 0.115, tanstack 0.510** (@solidjs/router's leaner `script` diagnostic is offset by its 2× `pushState` in the settle-timed wall). *(Sub-ms — session/load-dependent.)* `alloc/nav`: real-router leanest (~7 KB vs @solidjs/router 11 / tanstack 135).

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| nav / wall (click→settle) (ms) | **0.077** | 0.115 | 0.510 |
| · nav / task (ΔTaskDuration) (ms) | **0.084** | 0.129 | 0.527 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | 0.072 | **0.014** | 0.040 |
| · blink diag (gap=0, #1452) (ms) ⚖ | 0.025 | 0.043 | 0.025 |
| alloc / nav (GC pressure) (KB) | **6.56** | 10.98 | 135 |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table. **real-router stays flat and WINS @1000 — task 0.195 vs @solidjs/router 0.467 (~2.4×), tanstack 1.17** — @solidjs/router is *not* flat at scale (it degrades with N here), so the segment trie's structural edge shows in Solid too (as in React/Vue, unlike the earlier read). real-router's O(1) match holds the low flat curve.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| nav / task @10 (ms) | **0.261** | 0.367 | 0.756 |
| nav / task @100 (ms) | **0.193** | 0.307 | 0.644 |
| nav / task @1000 (ms) | **0.195** | 0.467 | 1.17 |
| · nav / wall @1000 (felt) (ms) | **0.100** | 0.300 | 0.600 |
| · ⚠ script (V8, microtask-blind #1451) @10 (ms) | 0.102 | **0.027** | 0.066 |
| · ⚠ script @100 (ms) | 0.097 | **0.027** | 0.067 |
| · ⚠ script @1000 (ms) | 0.092 | **0.029** | 0.085 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **@solidjs/router lightest at 10k (5.61 MB) — real-router near-parity (5.78, ~3%), tanstack heaviest (10.66).** Unlike the React/Vue cohorts (where real-router's trie wins memory), @solidjs/router's minimal route storage matches it here; the trie's space cost is nearly free at this scale.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| heap @1 (floor) (MB) | 1.97 | **1.71** | 2.12 |
| heap @1k (MB) | 2.50 | **2.21** | 3.13 |
| heap @10k (MB) | 5.78 | **5.61** | 10.66 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain. **real-router WINS at every depth — task 0.286 → 0.563 @90 vs @solidjs/router 0.315 → 0.811** — both rise ~linearly. The steep O(d²) rise seen in earlier runs was a **bench-app artifact** (an O(depth²) lazy-getter chain, since fixed) — the residual linear cost is `@real-router/solid`'s `RouteView` per-level composition (#1094), but it stays *under* @solidjs/router's deep curve. **@tanstack/solid-router is N/A** — it triggers its internal error boundary on 60+-segment deep routes (the @tanstack/react-router equivalent renders depth 90). Real apps rarely nest past ~10.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| nav / task @3 (ms) ⚖ | 0.286 | 0.315 | — |
| nav / task @30 (ms) | **0.351** | 0.437 | — |
| nav / task @60 (ms) | **0.552** | 0.643 | — |
| nav / task @90 (ms) | **0.563** | 0.811 | — |
| · nav / wall @90 (felt) (ms) | **0.400** | 0.700 | — |
| · ⚠ script (V8, microtask-blind #1451) @3 (ms) | 0.129 | **0.024** | — |
| · ⚠ script @30 (ms) | 0.243 | **0.033** | — |
| · ⚠ script @60 (ms) | 0.432 | **0.032** | — |
| · ⚠ script @90 (ms) | 0.439 | **0.032** | — |

## Search-param scaling — query-param count (sweep, reads all values) — `search-param-scaling`

Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`, the realistic high-count vector), reading every value — **where forcing materialization bites the lazy router.** **real-router stays FLAT and WINS @50 — task 0.292 vs @solidjs/router 1.00 (~3.4×), tanstack 1.85** (eager immutable params). **@solidjs/router RISES steeply**: its `useSearchParams()` reactive store charges a reactive read per value, so @1 it leads (0.387 vs real-router 0.651) but by @50 real-router's flat curve overtakes it. At the realistic high-count end the lazy advantage inverts. **`alloc/nav`** (GC pressure): real-router ~25 KB/nav vs @solidjs/router ~110 (~4.3×) / tanstack ~537 — eager params reference URL-parsed strings, flat with count; the memory counterpart to the flat CPU curve.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| nav / task @1 (ms) | 0.651 | **0.387** | 1.10 |
| nav / task @10 (ms) | **0.227** | 0.335 | 1.08 |
| nav / task @50 (ms) | **0.292** | 1.00 | 1.85 |
| · nav / wall @50 (felt) (ms) | **0.200** | 0.800 | 1.50 |
| · ⚠ script (query-parse, V8-blind #1451) @1 (ms) | 0.145 | **0.030** | 0.095 |
| · ⚠ script @10 (ms) | 0.131 | **0.037** | 0.132 |
| · ⚠ script @50 (ms) | **0.182** | 0.300 | 0.368 |
| alloc / nav @50↔@1 (GC pressure) (KB) | **25.50** | 110 | 537 |

## Nav churn (stress) — `nav-churn`

200-nav stress; per-nav **task** (CPU) + retained **heap Δ**. **real-router leanest CPU/nav — task 0.073** (< @solidjs/router 0.104 < tanstack 0.385); **@solidjs/router retains the least heap (242 KB), real-router 310, tanstack 644.** `navsPerSec` is NOT comparable here: real-router navigates synchronously (churns 200 navs without yielding → ~15k/s) while @solidjs/router + tanstack defer to the frame cadence — read CPU/nav + heap (heap Δ warmup-dominated, not a leak #1462).

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| nav / wall (= 1000/navsPerSec) (ms) | **0.066** | 0.096 | 0.380 |
| · nav / task (ΔTaskDuration) (ms) | **0.073** | 0.104 | 0.385 |
| throughput (real, settle-timed) (/s) | **15152** | 10417 | 2632 |
| · ⚠ script / nav (microtask-blind #1451) (ms) | 0.062 | **0.010** | 0.033 |
| · blink diag (gap=0, #1452) (ms) | **0.025** | 0.044 | 0.026 |
| heap Δ 0→200 navs (⚠ warmup-dominated, not a leak #1462) (KB) | 310 | **242** | 644 |

## Active links (100) — per-nav wall-clock (click→DOM settle) — `active-links`

Per-nav wall recompute across 100 links (steady-state toggle). **real-router WINS decisively — wall 0.080 vs @solidjs/router 0.270 (~3.4×), tanstack 2.51** — its shared cached active-source (one `router.subscribe`) beats @solidjs/router's per-`<A>` active tracking. Part of real-router's cross-cohort active-links lead (React / Svelte / Angular win too). *(Sub-ms — the win is robust; absolute ms session/load-dependent.)*

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| nav / wall (click→settle) (ms) | **0.080** | 0.270 | 2.51 |
| · nav / task (ΔTaskDuration) (ms) | **0.089** | 0.285 | 2.54 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | 0.076 | **0.014** | 0.038 |
| · blink diag (gap=0, #1452) (ms) | **0.026** | 0.046 | 0.028 |

## Back / forward — per-nav wall-clock (popstate → DOM settle) — `back-forward`

Browser **back/forward** (popstate) steady-state. **real-router ≈ @solidjs/router — wall 0.205 vs 0.207 (dead heat), tanstack 0.465.** **#1353** (skip no-op popstate `replaceState`) closed real-router's earlier ~68% gap to a tie with @solidjs/router's minimal single-popstate. real-router the **leanest allocator of all** (~7 KB/nav vs @solidjs/router 10 / tanstack 146). *(n=50.)*

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| nav / wall (back/fwd→settle) (ms) | **0.205** | 0.207 | 0.465 |
| · nav / task (ΔTaskDuration) (ms) | **0.098** | 0.103 | 0.394 |
| · ⚠ script (V8, microtask-blind #1451) (ms) ⚖ | 0.037 | 0.010 | 0.010 |
| · blink diag (gap=0; rr 2×/nav honest) (ms) ⚖ | 0.071 | 0.072 | 0.353 |
| alloc / nav (GC pressure) (KB) | **7.01** | 9.95 | 146 |

## Link build — mount 1000 links (href construction, wall-clock) — `link-build`

CPU to mount 1000 links, each building its href. **real-router leanest (8.70 ms); @solidjs/router 10.10; tanstack (27.20, ~3.1×).** Over the bare-`<a>` floor real-router adds the least reverse-matcher cost.

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| mount 1000 links (wall → DOM-commit, pre-paint; #1462) (ms) | **8.70** | 10.10 | 27.20 |

## Nested switch (reuse) — per-nav wall-clock (click→DOM settle) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **real-router leanest — wall 0.080 vs @solidjs/router 0.120, tanstack 0.515** (~50%), consistent with its nav-latency / param-nav wins here. *(Sub-ms — session/load-dependent.)*

| metric | real-router | solid-router | tanstack |
|---|---|---|---|
| nav / wall (click→settle) (ms) | **0.080** | 0.120 | 0.515 |
| · nav / task (ΔTaskDuration) (ms) | **0.108** | 0.150 | 0.547 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | 0.078 | **0.013** | 0.043 |
| · blink diag (gap=0, #1452) (ms) | **0.024** | 0.043 | 0.025 |

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
| cold-start script (ms) | 0.805 | 4.57 (+3.8) | 2.61 (+1.8) | 3.80 (+3.0) |
| cold-start heap retained (MB) | 1.64 | 2.05 (+0.4) | 1.78 (+0.1) | 2.22 (+0.6) |
| link-build mount (ms) | 1.90 | 8.70 (+6.8) | 10.10 (+8.2) | 27.20 (+25.3) |

**Reading:** over bare Solid, all three add little. real-router adds the least on links; @solidjs/router adds the least on cold-start. real-router's separation shows at scale (wide @1000, deep) and across per-nav, where it leads; @solidjs/router's shows at boot + retained memory. (Per-nav is ranked router-vs-router in the tables above — real-router leads nav-latency here.)

## What this does NOT measure / caveats

- **No cross-framework ranking** — each column is the same framework (Solid); the delta is router work. (Do NOT compare to the React/Vue cohorts.)
- **`@tanstack/solid-router` deep-config is N/A** — it triggers its internal error boundary on 60+-segment deep-nested routes (renders depth 3/30, errors at 60/90). The `@tanstack/react-router` equivalent renders depth 90; a @tanstack/solid-router limitation, reproducible in-harness (`node cross-router/run.mjs deep-config tanstack solid`).
- **`@real-router/solid` deep-nesting rises O(depth)** — the `RouteView` composition cost, tracked as #1094 (an adapter issue; the core matcher is flat-capable). real-router still wins deep here (0.56 vs @solidjs/router 0.81 @90). Real apps rarely nest past ~10.
- **`nav-churn` navsPerSec is NOT comparable** — real-router navigates synchronously (~14.7k/s), @solidjs/router + tanstack yield to frames (~123/s). Read CPU/nav + retained heap.
- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.
- `wide`/`deep` are scaling sweeps — the per-size *curve* matters (here @solidjs/router degrades on wide @1000 while real-router stays flat; on deep both rise ~linearly, real-router lower).
- **The `script` diagnostic sits near timer granularity** (Solid's per-nav script is sub-0.1 ms → inflated *relative* variance) — a diagnostic row, not the headline. At n=50 the headline **wall**/**task** and the sweeps sit within the RME gate; the findings (cold-start heap, wide/deep sweeps, table-heap, nav-latency wall) rest on stable signals (RME < ~3%).

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs solid`.

