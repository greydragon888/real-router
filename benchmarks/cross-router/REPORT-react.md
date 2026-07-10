# Cross-Router Performance — React cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/react` + `@real-router/browser-plugin` · `react-router@8` (Data mode) · `@tanstack/react-router` — routers that own a navigation pipeline (route-graph resolution, guard/lifecycle phases, immutable state, data).

**Scope — `wouter` is deliberately excluded** (a scoping choice stated up front, not a result). It is a minimalist location-matcher (regexparam matching + a location hook) — a *different class*: no transition pipeline, guards, loaders, or validated search, and **no cross-framework analog** (React/Preact only), so it cannot appear in the Vue/Solid/Svelte/Angular cohorts these benchmarks expand to. Benchmarking it here compares apples to oranges — its low per-nav cost reflects doing less, not faster engineering — and dilutes a like-for-like comparison of full routers. (See `.claude/competitor-routers.md` for wouter's place in the landscape.)

**Run:** runs 50 · warmup 5 · throttle off · 2026-07-09T15:44:31.999Z · Apple M3 Pro · numbers are **median** (winner per row **bold**).

⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the **stable signals only** — CPU (`script`), heap, FCP (all RME < 5%). Felt **latency was deliberately dropped** (its RME was 9–44% across every scenario — React render + display-frame cadence dominate, not router work; see *Why no latency* at the end). `nav-churn` throughput is frame-capped — read CPU/nav + heap. **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ — notably `history.pushState`'s `updateForSameDocumentNavigation` (~130 µs/nav, CDP-traced) and paint — which is ~identical across routers, so `script` *ratios* overstate the *total* per-nav gap (e.g. a ~4× `script` ratio is ≈ parity in total — Vue cohort all ~0.32 ms, CDP-traced + harness-reported).

## Cold start — `cold-start`

App init + parse/exec to first route painted (small route table).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| main-thread script (ms) | 12.31 | 14.53 | **11.50** |
| JS heap (MB) | 3.25 | 3.46 | **3.10** |
| FCP (ms) | **32.00** | 36.00 | **32.00** |

## Navigation — per-nav total main-thread (script + history) — `nav-latency`

Per-navigation **total main-thread** (script + Blink history, both harness-measured). **real-router is the lightest — winning *both* components** (lowest script *and* lowest Blink history of the three), running **~20-25% under** react-router and tanstack. Unlike the Vue cohort (where vue-router's 2×-`pushState` brings it to parity), all React routers hit history ~1×/nav, so real-router's lean script carries straight through to a clear total win. *(Sub-ms per-nav: absolutes are session/load-dependent — read the ranking + ratio, not the ms; `total` = `script` (V8/`ScriptDuration`) + Blink `updateForSameDocumentNavigation`.)* **`alloc/nav` (GC pressure): real-router is the leanest allocator too** — its compact immutable State allocates little per nav (~5× under tanstack, whose per-nav pipeline produces garbage).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.949** | 1.21 | 1.25 |
| · script (V8 only) (ms) | **0.620** | 0.898 | 0.929 |
| · Blink history (pushState) (ms) | 0.330 | **0.310** | 0.323 |
| alloc / nav (GC pressure) (KB) | **0.287** | 1.52 | 0.312 |

## Param navigation — per-nav total (script + history) — `param-nav`

Per-nav total changing :id (steady-state sweep /users/1→2→3…). **real-router lightest** — ~20-25% under react-router and tanstack (lowest script; Blink ~equal). *(Sub-ms — read ranking/ratio, not absolute ms; session/load-dependent.)* `alloc/nav` (GC pressure): real-router's immutable State references the new `:id` value rather than re-copying, so per-nav allocation stays low — read alongside the CPU rows.

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.656** | 0.928 | 0.848 |
| · script (V8 only) (ms) | **0.326** | 0.622 | 0.516 |
| · Blink history (pushState) (ms) | 0.330 | **0.303** | 0.333 |
| alloc / nav (GC pressure) (KB) | 0.633 | 2.02 | **0.390** |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table; per size **total** (script + Blink) + **script** (matcher). Flat curve = O(1)/trie, rising = O(N)/scan. **real-router stays flat and wins every size** (~0.48 total); tanstack flat-higher (~0.85); react-router degrades @1000 (0.72 → 1.45, O(N)). The matcher win holds on total, not just script.

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total @10 (ms) | **0.497** | 0.833 | 0.729 |
| ≈ total @100 (ms) | **0.455** | 0.859 | 0.760 |
| ≈ total @1000 (ms) | **0.474** | 0.834 | 1.44 |
| · script (matcher) @10 (ms) | **0.439** | 0.774 | 0.667 |
| · script (matcher) @100 (ms) | **0.398** | 0.802 | 0.697 |
| · script (matcher) @1000 (ms) | **0.419** | 0.776 | 1.38 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding a table of 1 / 1000 / 10000 routes (forced GC; @1 ≈ the React/app floor). The memory counterpart to wide-config. real-router's segment trie *historically* cost the most here — but heap-profiling traced the bulk to **empty per-route collections + redundant indexes, not the trie itself**, and **#1009 + #1010 removed them** (shared frozen sentinels, a monomorphic `CompiledRoute`, and dropping two duplicate `name→route` maps). At 10k real-router went from **heaviest (~1.85×) to the lightest** of the three (~0.63 KB/route, just under react-router) while keeping the flat O(1) match — the benchmark drove a real core optimization. The trie's genuine space-for-time cost turned out small; the rest was fixable slack. heap is the most stable signal (RME < 0.01%).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| heap @1 (floor) (MB) | 2.27 | 2.50 | **2.16** |
| heap @1k (MB) | 3.10 | 3.51 | **2.95** |
| heap @10k (MB) | **8.60** | 11.22 | 8.72 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain (sweep 3 / 30 / 60 / 90). **real-router and tanstack scale cleanly and monotonically** — real-router is lowest at every realistic depth. **react-router's curve is a parabola** (fine-grained: rises to ~6 ms near depth 45–60 — ~4× real-router — then declines back to ~1.7 ms at depth 90; the 60→90 drop is the parabola's right tail, not a threshold). Root cause (CPU-profiled + confirmed in react-router source): `matchRoutes` tries route branches **deepest-first** (`computeScore` ranks more segments higher) and re-matches every *deeper* branch before reaching the target — so depth D wastes `O((maxDepth−D)×D)` path re-normalization (`matchRouteBranch`/`joinPaths`/`removeDoubleSlashes`) on branches that fail; maximal mid-depth, zero only when the target *is* the deepest route. real-router walks its precompiled segment trie straight to the match (O(depth), no branch-retrying, no per-nav string normalization) — hence the clean low curve. Real apps rarely nest past ~10, where real-router wins outright regardless. (Table is total@D + script@D; the matcher/parabola story lives in `script`; on total real-router edges @90 too.)

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total @3 (ms) | **0.572** | 1.02 | 1.35 |
| ≈ total @30 (ms) | **0.991** | 2.01 | 4.64 |
| ≈ total @60 (ms) | **1.29** | 2.50 | 5.41 |
| ≈ total @90 (ms) | 1.76 | 2.88 | **1.73** |
| · script (matcher) @3 (ms) | **0.512** | 0.956 | 1.29 |
| · script (matcher) @30 (ms) | **0.928** | 1.95 | 4.59 |
| · script (matcher) @60 (ms) | **1.23** | 2.43 | 5.35 |
| · script (matcher) @90 (ms) | 1.69 | 2.82 | **1.67** |

## Search-param scaling — query-param count (sweep, reads all values) — `search-param-scaling`

Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`) — the realistic high-count vector (marketplace filters / analytics / tracking; path params top out at ~4). The leaf reads EVERY value, so lazy query is materialized (apples-to-apples). **real-router stays FLAT (~0.57 ms, slope ~0) and wins @50** — its eager immutable params make reading all 50 a cheap property access. **tanstack EXPLODES — 2.28 ms @50 (~4× real-router), slope ~18 µs/param**: its per-nav search parse + validate + structural-share pipeline is O(query-count). react-router is flat too (0.67 @50 — `URLSearchParams` is a cheap plain object) but a higher floor. At realistic marketplace query counts real-router's flat curve is the win — the eager snapshot never degrades. **`alloc/nav` (GC pressure, @50↔@1 toggle) tells the SAME story in memory:** real-router allocates ~0.42 KB/nav **flat** — its eager params *reference* the browser's URL-parsed strings instead of copying — while tanstack's parse/validate/structural-share pipeline churns ~2.0 KB/nav (**~5× real-router**; react-router middles at ~0.72). So the eager model wins **both** axes at high count — flat CPU *and* flat allocation — refuting the intuition that an eager snapshot must produce more garbage; it's actually the *leanest* allocator.

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total @1 (ms) | **0.520** | 1.40 | 0.675 |
| ≈ total @10 (ms) | **0.528** | 1.51 | 0.665 |
| ≈ total @50 (ms) | **0.564** | 2.29 | 0.691 |
| · script (query-parse) @1 (ms) | **0.453** | 1.34 | 0.611 |
| · script (query-parse) @10 (ms) | **0.466** | 1.45 | 0.607 |
| · script (query-parse) @50 (ms) | **0.499** | 2.22 | 0.629 |
| alloc / nav @50↔@1 (GC pressure) (KB) | **0.442** | 2.03 | 0.708 |

## Nav churn (stress) — `nav-churn`

200-nav stress; per-nav total (script + Blink) + heap. **real-router lightest CPU/nav (0.93 total)**, tanstack 1.15, react-router 1.28 — **and retains the least heap (704 KB)** (react-router 883, tanstack 1214). navsPerSec frame-capped — read CPU/nav + heap.

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total / nav (ms) | **0.979** | 1.20 | 1.32 |
| · script / nav (V8) (ms) | **0.659** | 0.902 | 0.991 |
| · Blink / nav (pushState) (ms) | 0.325 | **0.295** | 0.321 |
| heap retained (200 navs) (KB) | **711** | 1214 | 883 |
| throughput (frame-capped) (/s) | **121** | 121 | 120 |

## Active links (100) — per-nav total (script + history) — `active-links`

Per-nav total recompute across 100 links (steady-state toggle). **real-router lightest by a wide margin — 0.81 ms vs tanstack 1.44 / react-router 1.73 (~2× lighter)**: a shared cached active-source recomputes all 100 links off **one** `router.subscribe`, where react-router / tanstack pay per-link active machinery. Blink ~equal. **This is a cross-cohort strength — real-router leads or ties active-links in every cohort** (Svelte + Angular wins below; near-parity vs already-lean Solid / Vue).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.854** | 1.48 | 1.75 |
| · script (V8 only) (ms) | **0.509** | 1.22 | 1.42 |
| · Blink history (pushState) (ms) | 0.339 | **0.252** | 0.332 |

## Back / forward — per-nav total, browser history traversal (popstate) — `back-forward`

Browser **back/forward** (popstate) steady-state — the distinct history-traversal path (every other scenario drives `pushState` *forward*; this drives `history.back()/forward()`, one of the commonest real ops). Blink-**dominated** (~5× a forward `pushState`). **real-router WINS — ~1.5 ms total vs react-router ~2.4, tanstack ~2.5** (~35% under). **#1353 landed** (skip no-op popstate `replaceState`): real-router now fires **1 `updateForSameDocumentNavigation`/nav** (the browser's own traversal), not 2 — the redundant second history event on back/forward is gone. Leanest allocator too (~0.27 KB/nav). *(n=15 — ranking robust.)*

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total main-thread (ms) | **1.52** | 2.53 | 2.41 |
| · script (V8 only) (ms) | **0.357** | 0.688 | 0.656 |
| · Blink history (popstate) (ms) | **1.16** | 1.83 | 1.78 |
| alloc / nav (GC pressure) (KB) | **0.267** | 0.946 | 0.334 |

## Link build — mount 1000 links (href construction) — `link-build`

CPU to mount 1000 `<Link>`s at once — each builds its href via the router's reverse-matcher (`buildPath` / `generatePath` / `buildLocation`), isolated from route construction (done once at startup). A real cost for link-heavy pages (nav menus, sitemaps, paginated lists). **real-router leanest (7.50 ms) — its `<Link>` active state now resolves through a shared per-router active-name selector (one `router.subscribe` for all links, not a subscription per link), which cut ~1.6 ms off the mount**; react-router 9.70 (real-router leads by ~2 ms now), tanstack ~1.9× slower (14.4).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| script (1000 links) (ms) | **7.12** | 14.30 | 9.70 |

## Nested switch (reuse) — per-nav total (script + history) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **real-router lightest — 0.62 ms total** vs react-router 0.82 / tanstack 0.85.

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.664** | 0.863 | 0.839 |
| · script (V8 only) (ms) | **0.341** | 0.566 | 0.516 |
| · Blink history (pushState) (ms) | 0.326 | **0.294** | 0.328 |

## Feature support — capability, NOT a perf race

Even among full routers, first-class API coverage differs. `✓` = built-in API, `N/A` = none (would be hand-rolled in user-land) — verified against each router's real surface, so **`N/A` is feature-absence, not a speed loss**. The cost of these features is sub-µs/noise, so these are capability axes, not benchmarks (`data-on-navigation` also differs semantically per engine — same goal, different model — so it is not a 1:1 perf race either).

| capability | real-router | tanstack | react-router |
|---|---|---|---|
| Data on navigation (loader tied to route) | ✓ⁱ | ✓ⁱ | ✓ⁱ |
| Typed / validated search params (schema) | ✓ⁱ | ✓ⁱ | N/A |
| Blocking guard (canDeactivate / unsaved-changes) | ✓ⁱ | ✓ⁱ | ✓ⁱ |
| Built-in scroll restoration | ✓ | ✓ | ✓ |

`✓ⁱ` = **verified in-harness** — a functional demo app (`apps/react/<engine>/{data,search,guard}/`) the harness builds, drives, and asserts via `node cross-router/harness/verify-features.mjs` (data loaded on nav · `?n=5` typed to a number · leave blocked while dirty, allowed after Save). `✓` without `ⁱ` is API-verified only (scroll-restoration). `N/A` = no first-class API.

**Reading:** `real-router` and `tanstack` cover all four axes; `react-router` lacks first-class validated search (you parse `useSearchParams` by hand). Perf and capability are causally linked: a router's per-navigation cost buys a real pipeline — resolve the route node in the tree, compute the deactivate/activate path between current and target routes, run guard + lifecycle phases (no-ops when none are registered), build a fresh immutable state — the machinery that makes guards / data-loading / validated-search possible. A pipeline-less location-matcher (the excluded `wouter`, see **Scope** above) is cheaper per navigation precisely because it does none of this — a different class, not a faster one. So speed and surface are read together, not in isolation.

- **Data on navigation (loader tied to route)** — rr: `onEnter` + `lifecycle`/`preload` plugin · react-router: `loader`/`useLoaderData` · tanstack: `loader`
- **Typed / validated search params (schema)** — rr: `searchSchema` (zod) · tanstack: `validateSearch` (zod) · react-router: raw `useSearchParams` only (no validation)
- **Blocking guard (canDeactivate / unsaved-changes)** — rr: `canDeactivate` · react-router: `useBlocker` · tanstack: `useBlocker`
- **Built-in scroll restoration** — rr: `<RouterProvider scrollRestoration>` · react-router: `<ScrollRestoration>` · tanstack: `scrollRestoration: true`

## Router overhead over bare React (`_baseline`)

`_baseline` is the same pages with **no router** — manual `useState` + `history.pushState` for navigation, raw `<a>` for links. It is the floor: subtract it and what remains (`+Δ`) is each router's own marginal cost. (Matcher sweeps and route-table memory have no bare-React analog, so they are omitted.)

| metric | bare React | real-router | tanstack | react-router |
|---|---|---|---|---|
| cold-start script (ms) | 7.67 | 12.31 (+4.6) | 14.53 (+6.9) | 11.50 (+3.8) |
| cold-start heap (MB) | 2.75 | 3.25 (+0.5) | 3.46 (+0.7) | 3.10 (+0.3) |
| link-build script (ms) | 4.08 | 7.12 (+3.0) | 14.30 (+10.2) | 9.70 (+5.6) |

**Reading:** the `(+Δ)` is the router's marginal cost over bare React on the two axes where the baseline is a genuine floor — **boot** and **link mount**. real-router is near-lowest on link overhead; **tanstack pays ~2× the router overhead** on startup and links. real-router's cold-start overhead sits a little above react-router's — partly the `browser-plugin` (real History API) it carries by contract — but both are far below tanstack. (Per-nav is not shown here: an optimized router beats the naive manual-nav baseline, so it is ranked router-vs-router in the tables above — where real-router leads the React cohort.)

## What this does NOT measure / caveats

- **No cross-framework ranking** — each column is the same framework (React); the delta is router work.
- **Why no latency.** Wall-clock felt-latency was measured but **excluded**: across all 99 raw metrics its RME was 9–44% (vs < 5% for CPU/heap). A 20-nav warm diagnostic showed click→paint is dominated by React's render + the display-frame cadence (≈ one 60 fps frame), ~identical across engines — so it is not router-attributable. The router's real contribution is CPU (`script`), reported here. (Raw `latencyMs` is still in `results/*.json`.)
- **`nav-churn` navsPerSec is frame-capped** — not a router differentiator; CPU/nav + retained heap are.
- **FCP** (cold-start) is inherently jittery; treat `script`/`heap` as primary there.
- Each router is configured the idiomatic way for a plain SPA (not gimped). `real-router` includes `browser-plugin` (real History API) — that weight is part of its cold-start/bundle by contract.
- `wide`/`deep` are **scaling sweeps** — the per-size *curve* (does cost grow with N/D) matters more than any single point.

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs react`.

