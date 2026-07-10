# Cross-Router Performance — Svelte cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/svelte` · `sv-router` (community Svelte-5-first full router) · `@mateothegreat/svelte5-router` — Svelte 5 SFC apps (`vite-plugin-svelte`, `dedupe: ['svelte']`). **No `@tanstack/svelte-router` exists** (npm 404), so this cohort has no TanStack column; the popular `svelte-spa-router` (hash + regex) and `svelte-routing` are minimalist-class and excluded like `wouter`, and SvelteKit is framework-bundled (not a standalone router).

**Scope — three full routers, like-for-like** (SvelteKit + hash/minimalist routers excluded). The honest split has **two axes plus a capability axis**. **Matcher scale** (`wide-config`): **real-router wins** — its segment trie stays flat @1000 (0.37) while sv-router degrades O(N) (0.77) and mateo-router floors high (0.83); the structural trie win holds in Svelte (as in React/Vue). **Per-nav render + memory** (cold-start, nav-latency, param-nav, nav-churn, table-heap, nested-switch, link-build): **sv-router wins** — a remarkably lean router (heap @10k 2.26 MB vs real-router 8.43; link-build 3.2 ms vs 12.1). **Capability**: **real-router is the ONLY full-pipeline router** (guards + validated search + data + scroll); sv-router covers data + guard, mateo-router guard only. real-router's adapter soft-spots: deep-nesting `RouteView` O(depth) (#1094) and a heavy `<Link>` (link-build 12.1 ms — `buildPath` + per-component instantiation, the residual after #1101's shared-selector fix). mateo-router renders depth 90 (no error boundary, unlike `@tanstack/solid-router`).

**Run:** runs 50 · warmup 5 · throttle off · 2026-07-09T17:46:03.317Z · Apple M3 Pro · numbers are **median** (winner per row **bold**).

⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the stable signals — CPU (`script`), heap, FCP. Felt latency was dropped (render/frame-bound). `nav-churn` navsPerSec is frame-capped here (read CPU/nav + heap). **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ (`history.pushState` ~identical across routers), so `script` ratios overstate the `total` per-nav gap.

## Cold start — `cold-start`

App init + parse/exec to first route painted. **sv-router is the lightest to boot** (heap 2.54 MB, script 3.56 ms); mateo-router 2.60 / 3.93; real-router heaviest (2.99 / 5.02). Over the bare-Svelte floor (2.39 MB / 2.01 ms) real-router adds the most boot cost.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| main-thread script (ms) | 5.10 | **3.57** | 3.91 |
| JS heap (MB) | 3.01 | **2.54** | 2.60 |
| FCP (ms) | 24.00 | **16.00** | **16.00** |

## Navigation — per-nav total main-thread (script + history) — `nav-latency`

Per-navigation total (script + Blink history), steady-state. **sv-router is the leanest per-nav** — its script sits essentially at the bare-Svelte floor (minimal pipeline, no per-nav router work). real-router and mateo-router both trail that floor; real-router's eager transition pipeline carries more per-nav than sv-router's plain model. *(Sub-ms — absolutes and the real-router↔mateo order are session/load-dependent; sv-router-leanest is the robust read.)*

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.842 | **0.514** | 0.780 |
| · script (V8 only) (ms) | 0.526 | **0.238** | 0.471 |
| · Blink history (pushState) (ms) | 0.316 | **0.275** | 0.310 |
| alloc / nav (GC pressure) (KB) | 0.118 | **0.071** | 0.153 |

## Param navigation — per-nav total (script + history) — `param-nav`

Per-nav total changing :id (steady-state). **sv-router leanest; real-router second, mateo-router third** — sv-router's minimal reactive model sits below real-router's eager pipeline here. *(Sub-ms — session/load-dependent.)*

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.620 | **0.418** | 0.660 |
| · script (V8 only) (ms) | 0.296 | **0.128** | 0.340 |
| · Blink history (pushState) (ms) | 0.324 | **0.287** | 0.320 |
| alloc / nav (GC pressure) (KB) | 0.113 | **0.080** | 0.231 |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table — **the matcher crossover, and real-router's clearest win in this cohort.** real-router's segment trie stays FLAT (total ~0.37–0.41 across @10/@100/@1000; script 0.314 @1000), while **sv-router degrades O(N)** (0.293 → 0.767 @1000 — it sorts + scans its route-key list per nav) and mateo-router carries a high flat floor (~0.83). **real-router WINS @1000** (0.370 < sv-router 0.767 < mateo 0.831) on total — the structural trie advantage holds in Svelte (as in React/Vue, unlike the Solid cohort where @solidjs/router was also flat).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total @10 (ms) | 0.430 | **0.299** | 0.862 |
| ≈ total @100 (ms) | 0.394 | **0.347** | 0.816 |
| ≈ total @1000 (ms) | **0.402** | 0.784 | 0.869 |
| · script (matcher) @10 (ms) | 0.369 | **0.244** | 0.796 |
| · script (matcher) @100 (ms) | 0.337 | **0.295** | 0.752 |
| · script (matcher) @1000 (ms) | **0.343** | 0.727 | 0.807 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **sv-router wins decisively — 2.26 MB @10k** (its route table is a plain object map), vs real-router 8.43 and mateo-router 9.20 (heaviest). Unlike the React/Vue cohorts where real-router's trie was the memory winner, sv-router's minimal storage is far leaner here.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| heap @1 (floor) (MB) | 2.06 | **1.82** | 1.87 |
| heap @1k (MB) | 2.92 | **1.97** | 2.70 |
| heap @10k (MB) | 8.45 | **2.26** | 9.20 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain. **All three rise O(depth)** — real-router steepest (0.62 → 4.53 total, script 4.46 @90), sv-router leanest (2.68 @90), mateo-router 3.87. **Read this curve as directional:** #1094's Solid research found the analogous deep rise was ~60% a *Solid-specific* benchmark-app artifact (O(d²) lazy-prop construction) plus real adapter bugs — the Svelte deep cost has **not** been decomposed the same way, so the split between app-structure and `@real-router/svelte` `RouteView` composition here is open (the core matcher is flat-capable — cf. the Vue adapter's flat 0.24 @90). **mateo-router renders depth 90 fine** — unlike `@tanstack/solid-router`, which errored past ~30 in the Solid cohort. Real apps rarely nest past ~10.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total @3 (ms) | 0.648 | **0.382** | 0.677 |
| ≈ total @30 (ms) | 1.74 | **1.01** | 2.13 |
| ≈ total @60 (ms) | 3.04 | **1.61** | 2.98 |
| ≈ total @90 (ms) | 4.61 | **2.73** | 3.92 |
| · script (matcher) @3 (ms) | 0.587 | **0.325** | 0.615 |
| · script (matcher) @30 (ms) | 1.67 | **0.952** | 2.07 |
| · script (matcher) @60 (ms) | 2.98 | **1.55** | 2.92 |
| · script (matcher) @90 (ms) | 4.54 | **2.67** | 3.85 |

## Search-param scaling — query-param count (sweep, reads all values) — `search-param-scaling`

Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`, the realistic high-count vector), reading every value. **real-router is FLAT (~0.47 @50, slope ~0)** — eager immutable params — and **WINS @50 (0.465 vs sv-router 0.474, mateo-router 0.698)**: sv-router leads at @1 (its lazy reactive `route.search` is cheap for few params) but RISES with count and real-router's flat eager curve overtakes it by @50; mateo-router rises steepest. Reading all values at the realistic high-count end is exactly where eager materialization beats per-read reactive query. **`alloc/nav`** (GC-pressure axis): real-router's eager params reference URL-parsed strings, so per-nav allocation stays **flat** with query count — the memory counterpart to its flat `script` curve (react-cohort probe: real-router the leanest allocator; parse/validate pipelines allocate O(count) garbage).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total @1 (ms) | 0.480 | **0.439** | 0.501 |
| ≈ total @10 (ms) | 0.447 | **0.434** | 0.536 |
| ≈ total @50 (ms) | **0.472** | 0.488 | 0.710 |
| · script (query-parse) @1 (ms) | 0.413 | **0.382** | 0.438 |
| · script (query-parse) @10 (ms) | 0.385 | **0.375** | 0.476 |
| · script (query-parse) @50 (ms) | **0.406** | 0.424 | 0.645 |
| alloc / nav @50↔@1 (GC pressure) (KB) | 0.225 | **0.108** | 0.253 |

## Nav churn (stress) — `nav-churn`

200-nav stress; CPU/nav + retained heap. **sv-router leanest — CPU/nav 0.52, retained heap 243 KB**; mateo-router 0.78 / 295 KB; real-router 0.82 / 380 KB (heaviest here). `navsPerSec` is ~121 for all three (frame-capped in this cohort — read CPU/nav + heap).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total / nav (ms) | 0.876 | **0.519** | 0.812 |
| · script / nav (V8) (ms) | 0.552 | **0.262** | 0.509 |
| · Blink / nav (pushState) (ms) | 0.320 | **0.244** | 0.303 |
| heap retained (200 navs) (KB) | 387 | **243** | 295 |
| throughput (frame-capped) (/s) | 121 | **121** | 121 |

## Active links (100) — per-nav total (script + history) — `active-links`

Per-nav total recompute across 100 links (steady-state toggle). **real-router WINS** (its shared cached active-source, one `router.subscribe`) over sv-router and mateo-router (per-link `isActiveLink` attachment recompute). A clear per-nav win — and part of real-router's cross-cohort active-links lead (React / Angular win too). *(Sub-ms — the win is robust; absolute ms session/load-dependent.)*

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.575** | 0.672 | 0.757 |
| · script (V8 only) (ms) | **0.247** | 0.310 | 0.436 |
| · Blink history (pushState) (ms) | 0.328 | 0.367 | **0.321** |

## Back / forward — per-nav total, browser history traversal (popstate) — `back-forward`

Browser **back/forward** (popstate) steady-state. **Near 3-way tie (~3% spread) after #1353** — sv-router ~1.37, mateo-router ~1.41, real-router ~1.41 (tied with mateo, +2.9% over sv-router). The skip-no-op-`replaceState` fix cut real-router's back/forward from a **~53% loss to a dead heat** with the two minimal Svelte routers. #2 on allocation (~0.10; sv-router 0.07 leanest). *(n=15.)*

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | 1.41 | **1.37** | 1.41 |
| · script (V8 only) (ms) | 0.394 | **0.263** | 0.305 |
| · Blink history (popstate) (ms) | **1.02** | 1.14 | 1.09 |
| alloc / nav (GC pressure) (KB) | 0.101 | **0.068** | 0.159 |

## Link build — mount 1000 links (href construction) — `link-build`

CPU to mount 1000 links, each building its href. **sv-router leanest (3.25 ms ≈ the bare-`<a>` floor 3.01) — plain `<a href>` intercepted by a global click handler, no per-link component**; mateo-router 7.19; **real-router heaviest (12.1 ms)** — after #1101's shared active-name selector removed the per-link subscription, the residual is `@real-router/svelte`'s `<Link>` running `buildPath` per link + per-component instantiation; sv-router avoids both with a literal `<a href>` (`buildPath` is inherent — React/Solid/Angular rr pay it and win their link-build).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| script (1000 links) (ms) | 12.02 | **3.27** | 7.07 |

## Nested switch (reuse) — per-nav total (script + history) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **sv-router leanest; mateo-router second; real-router third** — sv-router's minimal model leads this sub-ms per-nav-render metric. *(Sub-ms — session/load-dependent.)*

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.633 | **0.443** | 0.557 |
| · script (V8 only) (ms) | 0.311 | **0.153** | 0.241 |
| · Blink history (pushState) (ms) | 0.326 | **0.288** | 0.317 |

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
| cold-start script (ms) | 1.98 | 5.10 (+3.1) | 3.57 (+1.6) | 3.91 (+1.9) |
| cold-start heap (MB) | 2.39 | 3.01 (+0.6) | 2.54 (+0.1) | 2.60 (+0.2) |
| link-build script (ms) | 2.99 | 12.02 (+9.0) | 3.27 (+0.3) | 7.07 (+4.1) |

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

