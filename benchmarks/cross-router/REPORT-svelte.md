# Cross-Router Performance — Svelte cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/svelte` · `sv-router` (community Svelte-5-first full router) · `@mateothegreat/svelte5-router` — Svelte 5 SFC apps (`vite-plugin-svelte`, `dedupe: ['svelte']`). **No `@tanstack/svelte-router` exists** (npm 404), so this cohort has no TanStack column; the popular `svelte-spa-router` (hash + regex) and `svelte-routing` are minimalist-class and excluded like `wouter`, and SvelteKit is framework-bundled (not a standalone router).

**Scope — three full routers, like-for-like** (SvelteKit + hash/minimalist routers excluded). The honest split has **two axes plus a capability axis**. **Matcher scale** (`wide-config`): **real-router wins** — its segment trie stays flat @1000 (0.44) while sv-router degrades O(N) (0.80) and mateo-router floors high (0.89); the structural trie win holds in Svelte (as in React/Vue). **Per-nav render + memory** (cold-start, nav-latency, param-nav, nav-churn, table-heap, nested-switch, link-build): **sv-router wins** — a remarkably lean router (heap @10k 2.26 MB vs real-router 8.38; link-build 3.3 ms vs 14.6). **Capability**: **real-router is the ONLY full-pipeline router** (guards + validated search + data + scroll); sv-router covers data + guard, mateo-router guard only. real-router's adapter soft-spots: deep-nesting `RouteView` O(depth) (#1094) and a heavy `<Link>` (link-build 14.6 ms — the reverse-matcher per link). mateo-router renders depth 90 (no error boundary, unlike `@tanstack/solid-router`).

**Run:** runs 10 · warmup 5 · throttle off · 2026-07-02T07:27:17.548Z · Apple M3 Pro · numbers are **median** (winner per row **bold**).

⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the stable signals — CPU (`script`), heap, FCP. Felt latency was dropped (render/frame-bound). `nav-churn` navsPerSec is frame-capped here (read CPU/nav + heap). **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ (`history.pushState` ~identical across routers), so `script` ratios overstate the `total` per-nav gap.

## Cold start — `cold-start`

App init + parse/exec to first route painted. **sv-router is the lightest to boot** (heap 2.54 MB, script 3.79 ms); mateo-router 2.61 / 4.22; real-router heaviest (2.98 / 5.13). Over the bare-Svelte floor (2.39 MB / 2.17 ms) real-router adds the most boot cost.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| main-thread script (ms) | 5.13 | **3.79** | 4.22 |
| JS heap (MB) | 2.98 | **2.54** | 2.60 |
| FCP (ms) | 24.00 | **16.00** | **16.00** |

## Navigation — per-nav total main-thread (script + history) — `nav-latency`

Per-navigation total (script + Blink history), steady-state. **sv-router is the leanest per-nav — 0.358 ms** (script 0.163 ≈ the bare-Svelte floor 0.166); real-router 0.489, mateo-router 0.499. sv-router's minimal pipeline sits essentially at the no-router floor.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.489 | **0.358** | 0.499 |
| · script (V8 only) (ms) | 0.304 | **0.163** | 0.279 |
| · Blink history (pushState) (ms) | **0.195** | 0.207 | 0.225 |

## Param navigation — per-nav total (script + history) — `param-nav`

Per-nav total changing :id (steady-state). **sv-router leanest (0.272); real-router 0.418; mateo-router 0.451.**

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.418 | **0.272** | 0.451 |
| · script (V8 only) (ms) | 0.227 | **0.092** | 0.254 |
| · Blink history (pushState) (ms) | 0.192 | **0.178** | 0.197 |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table — **the matcher crossover, and real-router's clearest win in this cohort.** real-router's segment trie stays FLAT (total ~0.44 across @10/@100/@1000; script 0.371 @1000), while **sv-router degrades O(N)** (0.328 → 0.796 @1000 — it sorts + scans its route-key list per nav) and mateo-router carries a high flat floor (~0.89). **real-router WINS @1000** (0.442 < sv-router 0.796 < mateo 0.888) on total — the structural trie advantage holds in Svelte (as in React/Vue, unlike the Solid cohort where @solidjs/router was also flat).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total @10 (ms) | 0.474 | **0.328** | 0.920 |
| ≈ total @100 (ms) | 0.434 | **0.360** | 0.860 |
| ≈ total @1000 (ms) | **0.442** | 0.796 | 0.888 |
| · script (matcher) @10 (ms) | 0.404 | **0.269** | 0.847 |
| · script (matcher) @100 (ms) | 0.368 | **0.298** | 0.795 |
| · script (matcher) @1000 (ms) | **0.371** | 0.738 | 0.820 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **sv-router wins decisively — 2.26 MB @10k** (its route table is a plain object map), vs real-router 8.38 and mateo-router 9.20 (heaviest). Unlike the React/Vue cohorts where real-router's trie was the memory winner, sv-router's minimal storage is far leaner here.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| heap @1 (floor) (MB) | 2.03 | **1.82** | 1.87 |
| heap @1k (MB) | 2.86 | **1.97** | 2.70 |
| heap @10k (MB) | 8.38 | **2.26** | 9.20 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain. **All three rise O(depth)** — real-router steepest (0.65 → 4.95 total, script 4.87 @90), sv-router leanest (2.94 @90), mateo-router 4.22. **Read this curve as directional:** #1094's Solid research found the analogous deep rise was ~60% a *Solid-specific* benchmark-app artifact (O(d²) lazy-prop construction) plus real adapter bugs — the Svelte deep cost has **not** been decomposed the same way, so the split between app-structure and `@real-router/svelte` `RouteView` composition here is open (the core matcher is flat-capable — cf. the Vue adapter's flat 0.24 @90). **mateo-router renders depth 90 fine** — unlike `@tanstack/solid-router`, which errored past ~30 in the Solid cohort. Real apps rarely nest past ~10.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total @3 (ms) | 0.654 | **0.434** | 0.792 |
| ≈ total @30 (ms) | 1.79 | **1.10** | 2.31 |
| ≈ total @60 (ms) | 3.13 | **1.74** | 3.26 |
| ≈ total @90 (ms) | 4.95 | **2.94** | 4.22 |
| · script (matcher) @3 (ms) | 0.589 | **0.367** | 0.714 |
| · script (matcher) @30 (ms) | 1.72 | **1.02** | 2.24 |
| · script (matcher) @60 (ms) | 3.06 | **1.67** | 3.18 |
| · script (matcher) @90 (ms) | 4.87 | **2.87** | 4.14 |

## Param scaling — path-param count (sweep) — `param-scaling`

Routes with 1 / 10 / 100 path params — floor-bound (matcher barely stressed). All three tight + flat (real-router 0.51–0.55, sv-router 0.48–0.57, mateo-router 0.50–0.52). Param count is ~a non-factor.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total @1 (ms) | 0.507 | **0.476** | 0.523 |
| ≈ total @10 (ms) | **0.470** | 0.477 | 0.497 |
| ≈ total @100 (ms) | 0.547 | 0.567 | **0.521** |
| · script (matcher) @1 (ms) | 0.436 | **0.414** | 0.452 |
| · script (matcher) @10 (ms) | **0.406** | 0.417 | 0.433 |
| · script (matcher) @100 (ms) | 0.477 | 0.496 | **0.454** |

## Nav churn (stress) — `nav-churn`

200-nav stress; CPU/nav + retained heap. **sv-router leanest — CPU/nav 0.241, retained heap 243 KB**; real-router 0.323 / 377 KB; mateo-router 0.414 / 295 KB. `navsPerSec` is ~121 for all three (frame-capped in this cohort — read CPU/nav + heap).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total / nav (ms) | 0.523 | **0.436** | 0.617 |
| · script / nav (V8) (ms) | 0.323 | **0.241** | 0.414 |
| · Blink / nav (pushState) (ms) | 0.204 | **0.183** | 0.230 |
| heap retained (200 navs) (KB) | 377 | **243** | 295 |
| throughput (frame-capped) (/s) | 121 | **121** | 121 |

## Active links (100) — per-nav total (script + history) — `active-links`

Per-nav total recompute across 100 links (steady-state toggle). **real-router WINS — 0.461** (its cached active-source) vs mateo-router 0.541 and sv-router 0.594 (per-link `isActiveLink` attachment recompute). One of real-router's two per-nav wins.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.461** | 0.594 | 0.541 |
| · script (V8 only) (ms) | **0.214** | 0.277 | 0.350 |
| · Blink history (pushState) (ms) | 0.235 | 0.291 | **0.173** |

## Link build — mount 1000 links (href construction) — `link-build`

CPU to mount 1000 links, each building its href. **sv-router leanest (3.31 ms ≈ the bare-`<a>` floor 3.03) — plain `<a href>` intercepted by a global click handler, no per-link component**; mateo-router 7.41; **real-router heaviest (14.6 ms)** — `@real-router/svelte`'s `<Link>` runs the reverse-matcher (`buildPath`) per link, a real adapter cost at 1000 links (echoes the Vue `<Link>` soft-spot).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| script (1000 links) (ms) | 14.61 | **3.31** | 7.41 |

## Nested switch (reuse) — per-nav total (script + history) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **sv-router leanest (0.347); mateo-router 0.442; real-router 0.501.**

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.501 | **0.347** | 0.442 |
| · script (V8 only) (ms) | 0.246 | **0.129** | 0.190 |
| · Blink history (pushState) (ms) | 0.246 | **0.221** | 0.253 |

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
| cold-start script (ms) | 2.17 | 5.13 (+3.0) | 3.79 (+1.6) | 4.22 (+2.1) |
| cold-start heap (MB) | 2.39 | 2.98 (+0.6) | 2.54 (+0.1) | 2.60 (+0.2) |
| nav script (ms) | 0.166 | 0.304 (+0.1) | 0.163 (−0.0) | 0.279 (+0.1) |
| link-build script (ms) | 3.03 | 14.61 (+11.6) | 3.31 (+0.3) | 7.41 (+4.4) |

**Reading:** over bare Svelte, sv-router adds almost nothing on the hot path (nav-latency + link-build sit ~at the floor); real-router adds the most on boot and on links (its `<Link>` reverse-matcher). real-router's separation is the matcher-scale win (wide @1000) + the full capability set, not the simple hot path.

## What this does NOT measure / caveats

- **No cross-framework ranking** — each column is the same framework (Svelte); the delta is router work. (Do NOT compare to the React/Vue/Solid cohorts.)
- **No `@tanstack/svelte-router`** — it does not exist (npm 404); the popular `svelte-spa-router` (hash + regex) and `svelte-routing` are minimalist-class (excluded like `wouter`), SvelteKit is framework-bundled. The cohort is real-router + the two community full routers that exist.
- **Deep-nesting rises O(depth) (script 4.87 ms @90) — cause not yet decomposed for Svelte.** #1094's Solid research showed the analogous rise was ~60% a *Solid-specific* benchmark-app artifact (O(d²) lazy props) + adapter bugs (cache-key + subtree remount), reduced to ~1.1 ms @90 in prototype. The Svelte deep app was not analyzed the same way — treat the curve as directional pending a #1094-style decomposition. The core matcher is flat-capable (Vue 0.24 @90).
- **`@real-router/svelte` `<Link>` is heavy** — link-build 14.6 ms for 1000 links (vs bare-`<a>` 3.0, sv-router 3.3): the reverse-matcher (`buildPath`) runs per link. An adapter optimization target (echoes the Vue `<Link>` soft-spot); a follow-up finding.
- **`mateo-router` renders depth 90** — no internal error boundary at deep nesting (contrast the Solid cohort's `@tanstack/solid-router`, which errored past ~30).
- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.
- `wide`/`deep`/`param-scaling` are scaling sweeps — the per-size *curve* matters (wide separates real-router flat-trie from sv-router O(N); deep separates the adapters' composition cost).
- **Elevated RME on two `nav-latency` `script` medians (n=10)** — `_baseline` (18.9%) and sv-router (15.0%) `scriptDurationMs` carry RME >15% because their per-nav script is sub-0.2 ms (near timer granularity → inflated *relative* variance). The nav-latency *total* and the headline findings (wide/deep sweeps, table-heap, cold-start heap, link-build) rest on stable, larger-magnitude signals (RME < ~5%).

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs svelte`.

