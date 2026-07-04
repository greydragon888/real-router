# Cross-Router Performance — Svelte cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/svelte` · `sv-router` (community Svelte-5-first full router) · `@mateothegreat/svelte5-router` — Svelte 5 SFC apps (`vite-plugin-svelte`, `dedupe: ['svelte']`). **No `@tanstack/svelte-router` exists** (npm 404), so this cohort has no TanStack column; the popular `svelte-spa-router` (hash + regex) and `svelte-routing` are minimalist-class and excluded like `wouter`, and SvelteKit is framework-bundled (not a standalone router).

**Scope — three full routers, like-for-like** (SvelteKit + hash/minimalist routers excluded). The honest split has **two axes plus a capability axis**. **Matcher scale** (`wide-config`): **real-router wins** — its segment trie stays flat @1000 (0.44) while sv-router degrades O(N) (0.80) and mateo-router floors high (0.89); the structural trie win holds in Svelte (as in React/Vue). **Per-nav render + memory** (cold-start, nav-latency, param-nav, nav-churn, table-heap, nested-switch, link-build): **sv-router wins** — a remarkably lean router (heap @10k 2.26 MB vs real-router 8.38; link-build 3.2 ms vs 12.0). **Capability**: **real-router is the ONLY full-pipeline router** (guards + validated search + data + scroll); sv-router covers data + guard, mateo-router guard only. real-router's adapter soft-spots: deep-nesting `RouteView` O(depth) (#1094) and a heavy `<Link>` (link-build 12.0 ms — `buildPath` + per-component instantiation, the residual after #1101's shared-selector fix). mateo-router renders depth 90 (no error boundary, unlike `@tanstack/solid-router`).

**Run:** runs 15 · warmup 5 · throttle off · 2026-07-04T08:24:22.826Z · Apple M3 Pro · numbers are **median** (winner per row **bold**).

⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the stable signals — CPU (`script`), heap, FCP. Felt latency was dropped (render/frame-bound). `nav-churn` navsPerSec is frame-capped here (read CPU/nav + heap). **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ (`history.pushState` ~identical across routers), so `script` ratios overstate the `total` per-nav gap.

## Cold start — `cold-start`

App init + parse/exec to first route painted. **sv-router is the lightest to boot** (heap 2.54 MB, script 3.79 ms); mateo-router 2.61 / 4.22; real-router heaviest (2.98 / 5.13). Over the bare-Svelte floor (2.39 MB / 2.17 ms) real-router adds the most boot cost.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| main-thread script (ms) | 4.87 | **3.56** | 3.94 |
| JS heap (MB) | 2.98 | **2.54** | 2.60 |
| FCP (ms) | 20.00 | 20.00 | **16.00** |

## Navigation — per-nav total main-thread (script + history) — `nav-latency`

Per-navigation total (script + Blink history), steady-state. **sv-router is the leanest per-nav — 0.358 ms** (script 0.163 ≈ the bare-Svelte floor 0.166); real-router 0.489, mateo-router 0.499. sv-router's minimal pipeline sits essentially at the no-router floor.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.786 | **0.482** | 0.724 |
| · script (V8 only) (ms) | 0.494 | **0.220** | 0.431 |
| · Blink history (pushState) (ms) | 0.288 | **0.260** | 0.290 |

## Param navigation — per-nav total (script + history) — `param-nav`

Per-nav total changing :id (steady-state). **sv-router leanest (0.272); real-router 0.418; mateo-router 0.451.**

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.561 | **0.383** | 0.602 |
| · script (V8 only) (ms) | 0.263 | **0.107** | 0.302 |
| · Blink history (pushState) (ms) | 0.300 | **0.274** | 0.292 |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table — **the matcher crossover, and real-router's clearest win in this cohort.** real-router's segment trie stays FLAT (total ~0.44 across @10/@100/@1000; script 0.371 @1000), while **sv-router degrades O(N)** (0.328 → 0.796 @1000 — it sorts + scans its route-key list per nav) and mateo-router carries a high flat floor (~0.89). **real-router WINS @1000** (0.442 < sv-router 0.796 < mateo 0.888) on total — the structural trie advantage holds in Svelte (as in React/Vue, unlike the Solid cohort where @solidjs/router was also flat).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total @10 (ms) | 0.420 | **0.301** | 0.839 |
| ≈ total @100 (ms) | 0.378 | **0.342** | 0.791 |
| ≈ total @1000 (ms) | **0.382** | 0.782 | 0.820 |
| · script (matcher) @10 (ms) | 0.358 | **0.244** | 0.770 |
| · script (matcher) @100 (ms) | 0.320 | **0.289** | 0.729 |
| · script (matcher) @1000 (ms) | **0.324** | 0.728 | 0.760 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **sv-router wins decisively — 2.26 MB @10k** (its route table is a plain object map), vs real-router 8.38 and mateo-router 9.20 (heaviest). Unlike the React/Vue cohorts where real-router's trie was the memory winner, sv-router's minimal storage is far leaner here.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| heap @1 (floor) (MB) | 2.04 | **1.82** | 1.87 |
| heap @1k (MB) | 2.87 | **1.97** | 2.70 |
| heap @10k (MB) | 8.40 | **2.26** | 9.20 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain. **All three rise O(depth)** — real-router steepest (0.65 → 4.95 total, script 4.87 @90), sv-router leanest (2.94 @90), mateo-router 4.22. **Read this curve as directional:** #1094's Solid research found the analogous deep rise was ~60% a *Solid-specific* benchmark-app artifact (O(d²) lazy-prop construction) plus real adapter bugs — the Svelte deep cost has **not** been decomposed the same way, so the split between app-structure and `@real-router/svelte` `RouteView` composition here is open (the core matcher is flat-capable — cf. the Vue adapter's flat 0.24 @90). **mateo-router renders depth 90 fine** — unlike `@tanstack/solid-router`, which errored past ~30 in the Solid cohort. Real apps rarely nest past ~10.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total @3 (ms) | 0.637 | **0.377** | 0.668 |
| ≈ total @30 (ms) | 1.69 | **0.994** | 2.14 |
| ≈ total @60 (ms) | 3.02 | **1.58** | 3.00 |
| ≈ total @90 (ms) | 4.67 | **2.66** | 3.94 |
| · script (matcher) @3 (ms) | 0.576 | **0.320** | 0.606 |
| · script (matcher) @30 (ms) | 1.62 | **0.940** | 2.08 |
| · script (matcher) @60 (ms) | 2.97 | **1.52** | 2.93 |
| · script (matcher) @90 (ms) | 4.61 | **2.60** | 3.87 |

## Param scaling — path-param count (sweep) — `param-scaling`

Routes with 1 / 10 / 100 path params — floor-bound (matcher barely stressed). All three tight + flat (real-router 0.51–0.55, sv-router 0.48–0.57, mateo-router 0.50–0.52). Param count is ~a non-factor.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total @1 (ms) | 0.466 | **0.412** | 0.488 |
| ≈ total @10 (ms) | 0.441 | **0.426** | 0.479 |
| ≈ total @100 (ms) | 0.523 | 0.480 | **0.460** |
| · script (matcher) @1 (ms) | 0.404 | **0.360** | 0.422 |
| · script (matcher) @10 (ms) | 0.377 | **0.370** | 0.416 |
| · script (matcher) @100 (ms) | 0.460 | 0.424 | **0.397** |

## Search-param scaling — query-param count (sweep, reads all values) — `search-param-scaling`

Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`, the realistic high-count vector), reading every value. **real-router is FLAT (~0.58 @50, slope ~0)** — eager immutable params. **sv-router wins @50 by a whisker (0.565 vs 0.575)** but RISES (slope ~1.7 µs/param — its reactive `route.search`), converging from its @1 lead (0.48 vs 0.55); **mateo-router rises steepest (~4.7 µs/param)**. real-router's eager params keep a flat curve while the reactive-query routers climb with count — the eager cost is paid once at nav, not per-read.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total @1 (ms) | 0.550 | **0.481** | 0.597 |
| ≈ total @10 (ms) | 0.519 | **0.493** | 0.637 |
| ≈ total @50 (ms) | 0.575 | **0.565** | 0.826 |
| · script (query-parse) @1 (ms) | 0.478 | **0.413** | 0.520 |
| · script (query-parse) @10 (ms) | 0.444 | **0.427** | 0.567 |
| · script (query-parse) @50 (ms) | **0.492** | 0.494 | 0.750 |

## Nav churn (stress) — `nav-churn`

200-nav stress; CPU/nav + retained heap. **sv-router leanest — CPU/nav 0.241, retained heap 243 KB**; real-router 0.323 / 377 KB; mateo-router 0.414 / 295 KB. `navsPerSec` is ~121 for all three (frame-capped in this cohort — read CPU/nav + heap).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total / nav (ms) | 0.837 | **0.512** | 0.789 |
| · script / nav (V8) (ms) | 0.536 | **0.257** | 0.494 |
| · Blink / nav (pushState) (ms) | 0.296 | **0.256** | 0.294 |
| heap retained (200 navs) (KB) | 380 | **243** | 295 |
| throughput (frame-capped) (/s) | 121 | 121 | **121** |

## Active links (100) — per-nav total (script + history) — `active-links`

Per-nav total recompute across 100 links (steady-state toggle). **real-router WINS — 0.461** (its cached active-source) vs mateo-router 0.541 and sv-router 0.594 (per-link `isActiveLink` attachment recompute). One of real-router's two per-nav wins.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.550** | 0.628 | 0.737 |
| · script (V8 only) (ms) | **0.245** | 0.307 | 0.431 |
| · Blink history (pushState) (ms) | **0.300** | 0.337 | 0.301 |

## Link build — mount 1000 links (href construction) — `link-build`

CPU to mount 1000 links, each building its href. **sv-router leanest (3.23 ms ≈ the bare-`<a>` floor 3.03) — plain `<a href>` intercepted by a global click handler, no per-link component**; mateo-router 7.02; **real-router heaviest (12.0 ms)** — after #1101's shared active-name selector removed the per-link subscription, the residual is `@real-router/svelte`'s `<Link>` running `buildPath` per link + per-component instantiation; sv-router avoids both with a literal `<a href>` (`buildPath` is inherent — React/Solid/Angular rr pay it and win their link-build).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| script (1000 links) (ms) | 11.97 | **3.23** | 7.02 |

## Nested switch (reuse) — per-nav total (script + history) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **sv-router leanest (0.347); mateo-router 0.442; real-router 0.501.**

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.593 | **0.421** | 0.541 |
| · script (V8 only) (ms) | 0.298 | **0.146** | 0.236 |
| · Blink history (pushState) (ms) | 0.295 | **0.273** | 0.304 |

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
| cold-start script (ms) | 1.97 | 4.87 (+2.9) | 3.56 (+1.6) | 3.94 (+2.0) |
| cold-start heap (MB) | 2.39 | 2.98 (+0.6) | 2.54 (+0.1) | 2.60 (+0.2) |
| nav script (ms) | 0.293 | 0.494 (+0.2) | 0.220 (−0.1) | 0.431 (+0.1) |
| link-build script (ms) | 2.95 | 11.97 (+9.0) | 3.23 (+0.3) | 7.02 (+4.1) |

**Reading:** over bare Svelte, sv-router adds almost nothing on the hot path (nav-latency + link-build sit ~at the floor); real-router adds the most on boot and on links (its `<Link>` reverse-matcher). real-router's separation is the matcher-scale win (wide @1000) + the full capability set, not the simple hot path.

## What this does NOT measure / caveats

- **No cross-framework ranking** — each column is the same framework (Svelte); the delta is router work. (Do NOT compare to the React/Vue/Solid cohorts.)
- **No `@tanstack/svelte-router`** — it does not exist (npm 404); the popular `svelte-spa-router` (hash + regex) and `svelte-routing` are minimalist-class (excluded like `wouter`), SvelteKit is framework-bundled. The cohort is real-router + the two community full routers that exist.
- **Deep-nesting rises O(depth) (script 4.87 ms @90) — cause not yet decomposed for Svelte.** #1094's Solid research showed the analogous rise was ~60% a *Solid-specific* benchmark-app artifact (O(d²) lazy props) + adapter bugs (cache-key + subtree remount), reduced to ~1.1 ms @90 in prototype. The Svelte deep app was not analyzed the same way — treat the curve as directional pending a #1094-style decomposition. The core matcher is flat-capable (Vue 0.24 @90).
- **`@real-router/svelte` `<Link>` is heavy** — link-build 12.0 ms for 1000 links (vs bare-`<a>` 3.0, sv-router 3.2). #1101's shared active-name selector already removed the per-link subscription (14.6 → 12.0); the residual is `buildPath` per link (inherent) + per-`<Link>`-component instantiation. sv-router avoids both via a literal `<a href>` + a global click handler.
- **`mateo-router` renders depth 90** — no internal error boundary at deep nesting (contrast the Solid cohort's `@tanstack/solid-router`, which errored past ~30).
- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.
- `wide`/`deep`/`param-scaling` are scaling sweeps — the per-size *curve* matters (wide separates real-router flat-trie from sv-router O(N); deep separates the adapters' composition cost).
- **Per-nav `nav-latency` `script` medians are near timer granularity** (`_baseline` and sv-router per-nav script is sub-0.2 ms → inflated *relative* variance); at n=15 they sit within the RME gate. The nav-latency *total* and the headline findings (wide/deep sweeps, table-heap, cold-start heap, link-build) rest on stable, larger-magnitude signals (RME < ~5%).

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs svelte`.

