# Cross-Router Performance — Angular cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/angular` · `@angular/router` — Angular 22 zoneless standalone-component apps (`@analogjs/vite-plugin-angular`, AOT). `@angular/router` is Angular's official router — a standalone routing library you configure (`provideRouter`, like vue-router), NOT framework-bundled — and the ONLY serious Angular router (no third-party alternatives), so this is a two-engine cohort by ecosystem reality.

**Scope — the two Angular full routers, like-for-like.** The honest picture on the n=50 metric: **`@angular/router` now holds only two axes** — cold-start (boots ~3× lighter — eager `@real-router/core` parse + init, #1106) and table-heap memory (3.68 vs 6.24 MB @10k — the O(1) segment trie's space-for-time cost). **real-router wins everything else — every scale sweep and every per-nav axis:** wide-config @1000 (**~12.9×** — @angular/router's matcher degrades with N, it is NOT a flat trie at scale), deep-config (**~3.3× @90**), search-param @50, nav-churn (CPU *and* retained heap), link-build, allocation (~15–35× leaner per nav), and — after the **#1466** sync-commit (`RouteView` + `injectRoute` / `injectRouteNode` call `detectChanges()` in the click task) — felt nav latency too (nav-latency / param-nav / nested-switch / active-links now ~3–13× wins, up from a loss or a tie). `@angular/router`'s one former per-nav edge — an imperative in-task `<router-outlet>` commit — is now matched. The two remaining losses are the inherent price of real-router's design (a full eager pipeline + O(1) matching) that *buys* the per-nav dominance; plus real-router adds validated search (capability) and the cross-framework single routing model.

**Run:** runs 50 · warmup 5 · throttle off · 2026-07-13T06:26:24.414Z · 622b27be-dirty · Apple M3 Pro · numbers are **median** (winner per row **bold**; a **⚖** row = the top-2 medians' 95% CIs overlap, so no winner is bolded — not statistically separable, #1460).

⚠️ Preliminary local numbers — directional, not a published verdict. Per-nav is **wall** (click→DOM settle — felt) + **task** (ΔTaskDuration — CPU); the `total = script + Blink` metric was **retired** (#1451/#1452); `script`/`blink` are ⚠ **diagnostics** (V8-only, microtask-blind). The route DOM now commits synchronously in the click task (#1466 — `RouteView` + `injectRoute` `detectChanges()`), so per-nav **wall ≈ task**. `nav-churn` navsPerSec is settle-timed. Angular 22 (zoneless), built via `@analogjs/vite-plugin-angular` (AOT).

## Cold start — `cold-start`

App init + parse/exec to first route painted. **@angular/router boots far lighter — script 2.06 ms** vs real-router 6.27 (~3.1× the boot script); **retained heap is at parity (2.65 = 2.65 MB, post-GC #1454).** Bare-Angular floor ~1.8 ms, so `@real-router/angular` adds ~4.3 ms of startup. **Decomposed (#1106, isolation ladder): the excess is CORE, not the adapter** — ~57% is parse+eval of the full `@real-router/core` bundle, ~28% is `createRouter`+`start()` (a warm re-run showed ~90% of *that* is one-time V8 cold-JIT, not initialization *work*); `provideRealRouter` DI (~0.04 ms) and `RouteView` (~0.64 ms) are cheap. A **code-size-driven one-time cost** — the price of shipping the full pipeline; competitors' lightness ∝ their smaller / tree-shaken code. Cross-cohort-consistent (~4.5–7 ms across solid/svelte/angular). #1106 tracks it (post-1.0 RFC-candidate; SSR/SSG amortizes boot).

| metric | real-router | angular-router |
|---|---|---|
| main-thread script (ms) | 6.27 | **2.06** |
| JS heap (retained, post-GC) (MB) | **2.65** | 2.65 |
| · JS heap @FCP (pre-GC, boot garbage — diag #1454) (MB) | 3.55 | **3.29** |
| FCP (ms) | 28.00 | **24.00** |

## Navigation — per-nav wall-clock (click→DOM settle) — `nav-latency`

Per-nav **wall** (click→DOM settle, felt) + **task** (ΔTaskDuration, CPU). **real-router WINS across the board — felt wall 0.072 vs @angular/router 0.230 (~3.2×), task 0.080 vs 0.238 (~3×), and allocation ~6 vs 122 KB/nav (~21.1×).** The felt-wall gap is **fixed (#1466)**: `RouteView` and `injectRoute` now commit the route DOM synchronously in the click task (a local `detectChanges()`) instead of waiting for the deferred zoneless CD flush — `@angular/router` activates its `<router-outlet>` in-task, and real-router now matches that while doing far less CPU and GC work. *(Sub-ms — read ranking/ratio, not absolute ms.)*

| metric | real-router | angular-router |
|---|---|---|
| nav / wall (click→settle) (ms) | **0.072** | 0.230 |
| · nav / task (ΔTaskDuration) (ms) | **0.080** | 0.238 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | 0.070 | **0.036** |
| · blink diag (gap=0, #1452) (ms) ⚖ | 0.023 | 0.023 |
| alloc / nav (GC pressure) (KB) | **5.76** | 122 |

## Param navigation — per-nav wall-clock (click→DOM settle) — `param-nav`

Per-nav wall + task changing :id (steady-state). **real-router wins CPU — task 0.124 vs @angular/router 0.345 (~2.8×) and alloc ~18.7× leaner (8 vs 146 KB)** — and felt wall now leads decisively (0.095 vs 0.858, ~9×): the #1466 `injectRoute` sync-commit closed the same-route param-render gap that both routers used to pay. *(Sub-ms — session/load-dependent.)*

| metric | real-router | angular-router |
|---|---|---|
| nav / wall (click→settle) (ms) | **0.095** | 0.858 |
| · nav / task (ΔTaskDuration) (ms) | **0.124** | 0.345 |
| · ⚠ script (V8, microtask-blind #1451) (ms) ⚖ | 0.092 | 0.092 |
| · blink diag (gap=0, #1452) (ms) | **0.024** | 0.025 |
| alloc / nav (GC pressure) (KB) | **7.83** | 146 |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table. **real-router stays flat and WINS @1000 by a wide margin — task 0.225 vs @angular/router 2.90 (~12.9×)** — @angular/router's matcher degrades sharply with N (it is *not* flat at scale), so real-router's segment trie is decisive here (as in React/Vue/Solid/Svelte). Its official router is not a trie.

| metric | real-router | angular-router |
|---|---|---|
| nav / task @10 (ms) | **0.345** | 0.608 |
| nav / task @100 (ms) | **0.217** | 0.807 |
| nav / task @1000 (ms) | **0.225** | 2.90 |
| · nav / wall @1000 (felt) (ms) | **0.100** | 2.70 |
| · ⚠ script (V8, microtask-blind #1451) @10 (ms) | 0.170 | **0.097** |
| · ⚠ script @100 (ms) | 0.122 | **0.087** |
| · ⚠ script @1000 (ms) | 0.119 | **0.097** |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **@angular/router lighter at 10k — 3.67 MB vs real-router 6.24.** real-router's segment-trie route storage is the heavier structure — but unlike the earlier read, it DOES buy the matcher-scale CPU win here (real-router wins wide @1000 ~12.9×, @angular/router's matcher degrades). So this cohort splits: real-router pays memory (trie storage), @angular/router pays CPU at scale.

| metric | real-router | angular-router |
|---|---|---|
| heap @1 (floor) (MB) | **2.32** | 2.52 |
| heap @1k (MB) | 2.85 | **2.68** |
| heap @10k (MB) | 6.24 | **3.67** |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain. **real-router WINS decisively — task 0.514 → 1.67 @90 vs @angular/router 1.11 → 5.53 (~3.3× @90)** — both rise O(depth) but @angular/router far steeper. Real apps rarely nest past ~10, where real-router already leads.

| metric | real-router | angular-router |
|---|---|---|
| nav / task @3 (ms) | **0.514** | 1.11 |
| nav / task @30 (ms) | **0.967** | 2.17 |
| nav / task @60 (ms) | **1.38** | 5.29 |
| nav / task @90 (ms) | **1.67** | 5.53 |
| · nav / wall @90 (felt) (ms) | **1.40** | 4.80 |
| · ⚠ script (V8, microtask-blind #1451) @3 (ms) | **0.329** | 0.399 |
| · ⚠ script @30 (ms) | **0.834** | 1.18 |
| · ⚠ script @60 (ms) | **1.25** | 2.09 |
| · ⚠ script @90 (ms) | **1.44** | 2.81 |

## Search-param scaling — query-param count (sweep, reads all values) — `search-param-scaling`

Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`, the realistic high-count vector), reading every value. **real-router WINS @50 — task 0.268 vs @angular/router 1.07 (~4×)** — real-router stays flat (eager immutable params) while @angular/router's `snapshot.queryParams` cost rises with count. **`alloc/nav`** (GC pressure): real-router ~13 KB/nav vs @angular/router ~524 (~38.9×) — eager params reference URL-parsed strings; @angular/router allocates heavily per nav.

| metric | real-router | angular-router |
|---|---|---|
| nav / task @1 (ms) | 1.08 | **0.738** |
| nav / task @10 (ms) | **0.230** | 0.664 |
| nav / task @50 (ms) | **0.268** | 1.07 |
| · nav / wall @50 (felt) (ms) | **0.200** | 1.00 |
| · ⚠ script (query-parse, V8-blind #1451) @1 (ms) | 0.255 | **0.238** |
| · ⚠ script @10 (ms) | **0.129** | 0.220 |
| · ⚠ script @50 (ms) | **0.159** | 0.294 |
| alloc / nav @50↔@1 (GC pressure) (KB) | **13.48** | 524 |

## Nav churn (stress) — `nav-churn`

200-nav stress; per-nav **task** (CPU) + retained **heap Δ**. **real-router wins both — task 0.086 vs @angular/router 0.225, and retains less heap (480 KB vs 906).** `navsPerSec` is settle-timed and now tracks CPU/nav (the route DOM commits in-task after #1466) — read CPU/nav + heap, not the raw rate (heap Δ warmup-dominated, not a leak #1462).

| metric | real-router | angular-router |
|---|---|---|
| nav / wall (= 1000/navsPerSec) (ms) | **0.078** | 0.219 |
| · nav / task (ΔTaskDuration) (ms) | **0.086** | 0.225 |
| throughput (real, settle-timed) (/s) | **12821** | 4556 |
| · ⚠ script / nav (microtask-blind #1451) (ms) | 0.075 | **0.031** |
| · blink diag (gap=0, #1452) (ms) ⚖ | 0.025 | 0.025 |
| heap Δ 0→200 navs (⚠ warmup-dominated, not a leak #1462) (KB) | **480** | 906 |

## Active links (100) — per-nav wall-clock (click→DOM settle) — `active-links`

Per-nav recompute across 100 links (steady-state toggle). **real-router WINS — task (CPU) 0.100 vs @angular/router 0.830 (~8.3×), and felt wall leads too (0.077 vs 1.03, ~13.4×) after the #1466 sync-commit.** Its shared cached active-source (one `router.subscribe`) beats `@angular/router`'s per-link `routerLinkActive` router-event subscription — real-router's clearest per-nav win in this cohort, part of its cross-cohort active-links lead (React + Svelte win too). *(Sub-ms — the win is robust; absolute ms session/load-dependent.)*

| metric | real-router | angular-router |
|---|---|---|
| nav / wall (click→settle) (ms) | **0.077** | 1.03 |
| · nav / task (ΔTaskDuration) (ms) | **0.100** | 0.830 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | **0.082** | 0.486 |
| · blink diag (gap=0, #1452) (ms) | **0.025** | 0.028 |

## Back / forward — per-nav wall-clock (popstate → DOM settle) — `back-forward`

Browser **back/forward** (popstate) steady-state. **real-router WINS — wall 0.202 vs @angular/router 0.395 (~2×), task 0.115 vs 0.350.** **#1353** (skip no-op popstate `replaceState`) removed real-router's redundant second history event. real-router the leaner **allocator** too (~7 KB/nav vs @angular/router 128, ~17.3×). *(n=50.)*

| metric | real-router | angular-router |
|---|---|---|
| nav / wall (back/fwd→settle) (ms) | **0.202** | 0.395 |
| · nav / task (ΔTaskDuration) (ms) | **0.115** | 0.350 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | **0.060** | 0.064 |
| · blink diag (gap=0; rr 2×/nav honest) (ms) | 0.092 | **0.057** |
| alloc / nav (GC pressure) (KB) | **7.42** | 128 |

## Link build — mount 1000 links (href construction, wall-clock) — `link-build`

CPU to mount 1000 links, each building its href. **real-router leaner — 13.10 ms** vs @angular/router 18.60, both heavy over the bare-`<a>` floor. real-router's `RealLink` runs the reverse-matcher (`buildPath`); `@angular/router`'s `routerLink` serializes a URL tree (config-independent) — different mechanisms, both costly. (`RealLink`'s active state uses the shared active-name selector fast path #1104; the residual is `buildPath` per link + directive/effect setup, not a per-link subscription.)

| metric | real-router | angular-router |
|---|---|---|
| mount 1000 links (wall → DOM-commit, pre-paint; #1462) (ms) | **13.10** | 18.60 |

## Nested switch (reuse) — per-nav wall-clock (click→DOM settle) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **real-router wins CPU — task 0.145 vs @angular/router 0.390 (~2.7×)** — and felt wall now leads too (0.115 vs 0.880, ~7.7×) after the #1466 sync-commit. *(Sub-ms — session/load-dependent.)*

| metric | real-router | angular-router |
|---|---|---|
| nav / wall (click→settle) (ms) | **0.115** | 0.880 |
| · nav / task (ΔTaskDuration) (ms) | **0.145** | 0.390 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | 0.113 | **0.084** |
| · blink diag (gap=0, #1452) (ms) | **0.024** | 0.025 |

## Feature support — capability, NOT a perf race

Both are full routers. `✓` = built-in API, `N/A` = none. `@angular/router` is feature-mature; the one gap vs real-router is schema-validated search.

| capability | real-router | angular-router |
|---|---|---|
| Data on navigation (loader tied to route) | ✓ | ✓ |
| Typed / validated search params (schema) | ✓ | N/A |
| Blocking guard (canDeactivate / unsaved-changes) | ✓ | ✓ |
| Built-in scroll restoration | ✓ | ✓ |

`✓` / `N/A` are API-verified against each router's surface. `N/A` = feature-absence, not a speed loss.

**Reading:** `@angular/router` covers data, guard, and scroll restoration first-class; the single gap is **schema-validated search** (real-router's `searchSchema`). So real-router's capability edge in Angular is narrow (one axis) — the honest differentiators are perf on active-links/link-build + validated search + the cross-framework single routing model, not a broad feature or scale advantage.

- **Data on navigation (loader tied to route)** — rr: `onEnter` + `lifecycle`/`preload` plugin · @angular/router: `resolve` resolvers
- **Typed / validated search params (schema)** — rr: `searchSchema` (zod) · @angular/router: raw `queryParams` (typed via input binding, no schema validation)
- **Blocking guard (canDeactivate / unsaved-changes)** — rr: `canDeactivate` · @angular/router: `CanDeactivate` route guard
- **Built-in scroll restoration** — rr: `<RouterProvider>` scrollRestoration · @angular/router: `withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })`

## Router overhead over bare Angular (`_baseline`)

`_baseline` is the same pages with **no router** — manual `signal` view + `history.pushState`, raw `<a>`. Subtract it and `+Δ` is each router's marginal cost.

| metric | bare Angular | real-router | angular-router |
|---|---|---|---|
| cold-start script (ms) | 1.80 | 6.27 (+4.5) | 2.06 (+0.3) |
| cold-start heap retained (MB) | 2.05 | 2.65 (+0.6) | 2.65 (+0.6) |
| link-build mount (ms) | 5.20 | 13.10 (+7.9) | 18.60 (+13.4) |

**Reading:** over bare Angular, `@angular/router` adds very little at boot (~0.3 ms); real-router adds ~4.3 ms at boot (upfront trie build). (Per-nav is not shown here: the naive manual click→pushState→signal baseline is heavier than either optimized router, so it is ranked router-vs-router in the tables above.)

## What this does NOT measure / caveats

- **No cross-framework ranking** — both columns are the same framework (Angular); the delta is router work.
- **`@angular/router` is the only serious Angular router** — no third-party standalone alternatives exist (unlike React/Vue/Solid/Svelte), so this is a two-engine cohort by ecosystem reality, not exclusion.
- **Deep-config is directional** — both rise O(depth), not decomposed for Angular. #1094's Solid research found the analogous rise was ~60% a Solid-specific bench-app artifact + adapter bugs (fix is `packages/solid`-only). Real apps rarely nest past ~10.
- **real-router's heavier cold-start (~3× the boot script) is the upfront segment-trie build** (createRouter + start) — cross-cohort-consistent (~4.5–7 ms across solid/svelte/angular), the price of O(1) matching paid at boot; a design trade-off, not a defect.
- **`@real-router/angular` `<Link>` link-build** — the shared active-name selector fast path already shipped (#1104, parallel to Svelte's #1101); the residual link-build cost is `buildPath` per link (inherent — React/Solid rr pay it and still win link-build) + Angular directive/effect instantiation, not a per-link subscription.
- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.
- `wide`/`deep` are scaling sweeps — the per-size *curve* matters (@angular/router degrades on wide @1000 while real-router stays flat; on deep both rise O(depth), real-router far lower).
- **real-router's `nav-latency` `script` diagnostic is near timer granularity** (sub-0.6 ms → inflated *relative* variance) — a diagnostic row. At n=50 the headline **wall**/**task** + the sweeps (cold-start, wide/deep, table-heap, active-links, link-build) rest on stable, larger-magnitude signals (RME < ~3%). Per-nav wall now commits synchronously in-task (#1466 fixed), so it tracks the CPU cost.

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs angular`.

