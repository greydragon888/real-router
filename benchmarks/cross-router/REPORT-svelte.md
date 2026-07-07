# Cross-Router Performance — Svelte cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/svelte` · `sv-router` (community Svelte-5-first full router) · `@mateothegreat/svelte5-router` — Svelte 5 SFC apps (`vite-plugin-svelte`, `dedupe: ['svelte']`). **No `@tanstack/svelte-router` exists** (npm 404), so this cohort has no TanStack column; the popular `svelte-spa-router` (hash + regex) and `svelte-routing` are minimalist-class and excluded like `wouter`, and SvelteKit is framework-bundled (not a standalone router).

**Scope — three full routers, like-for-like** (SvelteKit + hash/minimalist routers excluded). The honest split has **two axes plus a capability axis**. **Matcher scale** (`wide-config`): **real-router wins** — its segment trie stays flat @1000 (0.37) while sv-router degrades O(N) (0.77) and mateo-router floors high (0.83); the structural trie win holds in Svelte (as in React/Vue). **Per-nav render + memory** (cold-start, nav-latency, param-nav, nav-churn, table-heap, nested-switch, link-build): **sv-router wins** — a remarkably lean router (heap @10k 2.26 MB vs real-router 8.43; link-build 3.2 ms vs 12.1). **Capability**: **real-router is the ONLY full-pipeline router** (guards + validated search + data + scroll); sv-router covers data + guard, mateo-router guard only. real-router's adapter soft-spots: deep-nesting `RouteView` O(depth) (#1094) and a heavy `<Link>` (link-build 12.1 ms — `buildPath` + per-component instantiation, the residual after #1101's shared-selector fix). mateo-router renders depth 90 (no error boundary, unlike `@tanstack/solid-router`).

**Run:** runs 30 · warmup 5 · throttle off · 2026-07-06T22:57:21.214Z · Apple M3 Pro · numbers are **median** (winner per row **bold**).

⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the stable signals — CPU (`script`), heap, FCP. Felt latency was dropped (render/frame-bound). `nav-churn` navsPerSec is frame-capped here (read CPU/nav + heap). **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ (`history.pushState` ~identical across routers), so `script` ratios overstate the `total` per-nav gap.

## Cold start — `cold-start`

App init + parse/exec to first route painted. **sv-router is the lightest to boot** (heap 2.54 MB, script 3.56 ms); mateo-router 2.60 / 3.93; real-router heaviest (2.99 / 5.02). Over the bare-Svelte floor (2.39 MB / 2.01 ms) real-router adds the most boot cost.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| main-thread script (ms) | 5.02 | **3.56** | 3.93 |
| JS heap (MB) | 2.99 | **2.54** | 2.60 |
| FCP (ms) | 24.00 | **16.00** | **16.00** |

## Navigation — per-nav total main-thread (script + history) — `nav-latency`

Per-navigation total (script + Blink history), steady-state. **sv-router is the leanest per-nav** — its script sits essentially at the bare-Svelte floor (minimal pipeline, no per-nav router work). real-router and mateo-router both trail that floor; real-router's eager transition pipeline carries more per-nav than sv-router's plain model. *(Sub-ms — absolutes and the real-router↔mateo order are session/load-dependent; sv-router-leanest is the robust read.)*

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.794 | **0.490** | 0.740 |
| · script (V8 only) (ms) | 0.503 | **0.228** | 0.450 |
| · Blink history (pushState) (ms) | 0.296 | **0.262** | 0.289 |
| alloc / nav (GC pressure) (KB) | 0.126 | **0.072** | 0.162 |

## Param navigation — per-nav total (script + history) — `param-nav`

Per-nav total changing :id (steady-state). **sv-router leanest; real-router second, mateo-router third** — sv-router's minimal reactive model sits below real-router's eager pipeline here. *(Sub-ms — session/load-dependent.)*

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.584 | **0.394** | 0.629 |
| · script (V8 only) (ms) | 0.287 | **0.122** | 0.333 |
| · Blink history (pushState) (ms) | 0.302 | **0.276** | 0.295 |
| alloc / nav (GC pressure) (KB) | 0.116 | **0.074** | 0.242 |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table — **the matcher crossover, and real-router's clearest win in this cohort.** real-router's segment trie stays FLAT (total ~0.37–0.41 across @10/@100/@1000; script 0.314 @1000), while **sv-router degrades O(N)** (0.293 → 0.767 @1000 — it sorts + scans its route-key list per nav) and mateo-router carries a high flat floor (~0.83). **real-router WINS @1000** (0.370 < sv-router 0.767 < mateo 0.831) on total — the structural trie advantage holds in Svelte (as in React/Vue, unlike the Solid cohort where @solidjs/router was also flat).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total @10 (ms) | 0.406 | **0.293** | 0.833 |
| ≈ total @100 (ms) | 0.365 | **0.339** | 0.791 |
| ≈ total @1000 (ms) | **0.370** | 0.767 | 0.831 |
| · script (matcher) @10 (ms) | 0.350 | **0.243** | 0.771 |
| · script (matcher) @100 (ms) | 0.311 | **0.288** | 0.730 |
| · script (matcher) @1000 (ms) | **0.314** | 0.714 | 0.777 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **sv-router wins decisively — 2.26 MB @10k** (its route table is a plain object map), vs real-router 8.43 and mateo-router 9.20 (heaviest). Unlike the React/Vue cohorts where real-router's trie was the memory winner, sv-router's minimal storage is far leaner here.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| heap @1 (floor) (MB) | 2.04 | **1.82** | 1.87 |
| heap @1k (MB) | 2.89 | **1.97** | 2.70 |
| heap @10k (MB) | 8.43 | **2.26** | 9.20 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain. **All three rise O(depth)** — real-router steepest (0.62 → 4.53 total, script 4.46 @90), sv-router leanest (2.68 @90), mateo-router 3.87. **Read this curve as directional:** #1094's Solid research found the analogous deep rise was ~60% a *Solid-specific* benchmark-app artifact (O(d²) lazy-prop construction) plus real adapter bugs — the Svelte deep cost has **not** been decomposed the same way, so the split between app-structure and `@real-router/svelte` `RouteView` composition here is open (the core matcher is flat-capable — cf. the Vue adapter's flat 0.24 @90). **mateo-router renders depth 90 fine** — unlike `@tanstack/solid-router`, which errored past ~30 in the Solid cohort. Real apps rarely nest past ~10.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total @3 (ms) | 0.624 | **0.374** | 0.658 |
| ≈ total @30 (ms) | 1.68 | **1.00** | 2.10 |
| ≈ total @60 (ms) | 3.00 | **1.60** | 2.99 |
| ≈ total @90 (ms) | 4.53 | **2.68** | 3.87 |
| · script (matcher) @3 (ms) | 0.567 | **0.318** | 0.597 |
| · script (matcher) @30 (ms) | 1.61 | **0.945** | 2.04 |
| · script (matcher) @60 (ms) | 2.94 | **1.55** | 2.92 |
| · script (matcher) @90 (ms) | 4.46 | **2.61** | 3.80 |

## Search-param scaling — query-param count (sweep, reads all values) — `search-param-scaling`

Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`, the realistic high-count vector), reading every value. **real-router is FLAT (~0.47 @50, slope ~0)** — eager immutable params — and **WINS @50 (0.465 vs sv-router 0.474, mateo-router 0.698)**: sv-router leads at @1 (its lazy reactive `route.search` is cheap for few params) but RISES with count and real-router's flat eager curve overtakes it by @50; mateo-router rises steepest. Reading all values at the realistic high-count end is exactly where eager materialization beats per-read reactive query. **`alloc/nav`** (GC-pressure axis): real-router's eager params reference URL-parsed strings, so per-nav allocation stays **flat** with query count — the memory counterpart to its flat `script` curve (react-cohort probe: real-router the leanest allocator; parse/validate pipelines allocate O(count) garbage).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total @1 (ms) | 0.452 | **0.423** | 0.504 |
| ≈ total @10 (ms) | 0.428 | **0.424** | 0.535 |
| ≈ total @50 (ms) | **0.465** | 0.474 | 0.698 |
| · script (query-parse) @1 (ms) | 0.388 | **0.369** | 0.439 |
| · script (query-parse) @10 (ms) | **0.369** | **0.369** | 0.481 |
| · script (query-parse) @50 (ms) | **0.401** | 0.412 | 0.634 |
| alloc / nav @50↔@1 (GC pressure) (KB) | 0.219 | **0.115** | 0.254 |

## Nav churn (stress) — `nav-churn`

200-nav stress; CPU/nav + retained heap. **sv-router leanest — CPU/nav 0.52, retained heap 243 KB**; mateo-router 0.78 / 295 KB; real-router 0.82 / 380 KB (heaviest here). `navsPerSec` is ~121 for all three (frame-capped in this cohort — read CPU/nav + heap).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total / nav (ms) | 0.817 | **0.515** | 0.779 |
| · script / nav (V8) (ms) | 0.522 | **0.254** | 0.490 |
| · Blink / nav (pushState) (ms) | 0.296 | **0.260** | 0.288 |
| heap retained (200 navs) (KB) | 380 | **243** | 295 |
| throughput (frame-capped) (/s) | 121 | 121 | **121** |

## Active links (100) — per-nav total (script + history) — `active-links`

Per-nav total recompute across 100 links (steady-state toggle). **real-router WINS** (its shared cached active-source, one `router.subscribe`) over sv-router and mateo-router (per-link `isActiveLink` attachment recompute). A clear per-nav win — and part of real-router's cross-cohort active-links lead (React / Angular win too). *(Sub-ms — the win is robust; absolute ms session/load-dependent.)*

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.542** | 0.640 | 0.729 |
| · script (V8 only) (ms) | **0.240** | 0.304 | 0.431 |
| · Blink history (pushState) (ms) | 0.302 | 0.338 | **0.295** |

## Link build — mount 1000 links (href construction) — `link-build`

CPU to mount 1000 links, each building its href. **sv-router leanest (3.25 ms ≈ the bare-`<a>` floor 3.01) — plain `<a href>` intercepted by a global click handler, no per-link component**; mateo-router 7.19; **real-router heaviest (12.1 ms)** — after #1101's shared active-name selector removed the per-link subscription, the residual is `@real-router/svelte`'s `<Link>` running `buildPath` per link + per-component instantiation; sv-router avoids both with a literal `<a href>` (`buildPath` is inherent — React/Solid/Angular rr pay it and win their link-build).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| script (1000 links) (ms) | 12.06 | **3.25** | 7.19 |

## Nested switch (reuse) — per-nav total (script + history) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **sv-router leanest; mateo-router second; real-router third** — sv-router's minimal model leads this sub-ms per-nav-render metric. *(Sub-ms — session/load-dependent.)*

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.597 | **0.419** | 0.532 |
| · script (V8 only) (ms) | 0.296 | **0.148** | 0.232 |
| · Blink history (pushState) (ms) | 0.300 | **0.272** | 0.296 |

## Feature support — capability, NOT a perf race

Among three full routers, first-class API coverage differs sharply. `✓` = built-in API, `N/A` = none (hand-rolled). real-router is the only one covering all four axes.

| capability | real-router | sv-router | mateo-router |
|---|---|---|---|
| Data on navigation (loader tied to route) | ✓ | ✓ | N/A |
| Typed / validated search params (schema) | ✓ | N/A | N/A |
| Blocking guard (canDeactivate / unsaved-changes) | ✓ | ✓ | ✓ |
| Built-in scroll restoration | ✓ | N/A | N/A |

`✓` / `N/A` are API-verified against each router's surface (the in-harness `✓ⁱ` demo verification exists for the React cohort; `@real-router/svelte` shares that pipeline — in-harness `✓ⁱ` for svelte is a follow-up). `N/A` = feature-absence, not a speed loss.

**Reading:** **real-router is the only full-capability router** in this cohort (all four axes). sv-router covers data + guard but lacks validated search and scroll restoration; mateo-router is guard-only. sv-router's leanness in the perf tables partly reflects this smaller surface — perf and capability read together.

- **Data on navigation (loader tied to route)** — rr: `onEnter` + `lifecycle`/`preload` plugin · sv-router: `beforeLoad`/`afterLoad` hooks · @mateothegreat: hooks are guard-style (`pre`/`post` return boolean), no data-returning loader
- **Typed / validated search params (schema)** — rr: `searchSchema` (zod) · sv-router: reactive `searchParams` only (no schema) · @mateothegreat: raw querystring parsing (no schema)
- **Blocking guard (canDeactivate / unsaved-changes)** — rr: `canDeactivate` · sv-router: `blockNavigation` · @mateothegreat: `hooks.pre` (returns boolean)
- **Built-in scroll restoration** — rr: `<RouterProvider scrollRestoration>` · sv-router: `scrollToTop` only (no saved-position restore) · @mateothegreat: none

## Router overhead over bare Svelte (`_baseline`)

`_baseline` is the same pages with **no router** — manual `$state` view + `history.pushState`, raw `<a>`. Subtract it and `+Δ` is each router's marginal cost.

| metric | bare Svelte | real-router | sv-router | mateo-router |
|---|---|---|---|---|
| cold-start script (ms) | 2.01 | 5.02 (+3.0) | 3.56 (+1.6) | 3.93 (+1.9) |
| cold-start heap (MB) | 2.39 | 2.99 (+0.6) | 2.54 (+0.1) | 2.60 (+0.2) |
| link-build script (ms) | 3.01 | 12.06 (+9.0) | 3.25 (+0.2) | 7.19 (+4.2) |

**Reading:** over bare Svelte, sv-router's plain `<a href>` link-build sits ~at the floor; real-router adds the most on boot and on links (its `<Link>` reverse-matcher). real-router's separation is the matcher-scale win (wide @1000) + the full capability set, not the simple hot path. (Per-nav is ranked router-vs-router in the tables above.)

## What this does NOT measure / caveats

- **No cross-framework ranking** — each column is the same framework (Svelte); the delta is router work. (Do NOT compare to the React/Vue/Solid cohorts.)
- **No `@tanstack/svelte-router`** — it does not exist (npm 404); the popular `svelte-spa-router` (hash + regex) and `svelte-routing` are minimalist-class (excluded like `wouter`), SvelteKit is framework-bundled. The cohort is real-router + the two community full routers that exist.
- **Deep-nesting rises O(depth) (script 4.46 ms @90) — cause not yet decomposed for Svelte.** #1094's Solid research showed the analogous rise was ~60% a *Solid-specific* benchmark-app artifact (O(d²) lazy props) + adapter bugs (cache-key + subtree remount), reduced to ~1.1 ms @90 in prototype. The Svelte deep app was not analyzed the same way — treat the curve as directional pending a #1094-style decomposition. The core matcher is flat-capable (Vue 0.24 @90).
- **`@real-router/svelte` `<Link>` is heavy** — link-build 12.1 ms for 1000 links (vs bare-`<a>` 3.0, sv-router 3.3). #1101's shared active-name selector already removed the per-link subscription (14.6 → 12.0); the residual is `buildPath` per link (inherent) + per-`<Link>`-component instantiation. sv-router avoids both via a literal `<a href>` + a global click handler.
- **`mateo-router` renders depth 90** — no internal error boundary at deep nesting (contrast the Solid cohort's `@tanstack/solid-router`, which errored past ~30).
- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.
- `wide`/`deep` are scaling sweeps — the per-size *curve* matters (wide separates real-router flat-trie from sv-router O(N); deep separates the adapters' composition cost).
- **Per-nav `nav-latency` `script` medians are near timer granularity** (`_baseline` and sv-router per-nav script is sub-0.3 ms → inflated *relative* variance); at n=30 they sit within the RME gate. The nav-latency *total* and the headline findings (wide/deep sweeps, table-heap, cold-start heap, link-build) rest on stable, larger-magnitude signals (RME < ~5%).

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs svelte`.

