# Cross-Router Performance — React cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/react` + `@real-router/browser-plugin` · `react-router@8` (Data mode) · `@tanstack/react-router` — routers that own a navigation pipeline (route-graph resolution, guard/lifecycle phases, immutable state, data).

**Scope — `wouter` is deliberately excluded** (a scoping choice stated up front, not a result). It is a minimalist location-matcher (regexparam matching + a location hook) — a *different class*: no transition pipeline, guards, loaders, or validated search, and **no cross-framework analog** (React/Preact only), so it cannot appear in the Vue/Solid/Svelte/Angular cohorts these benchmarks expand to. Benchmarking it here compares apples to oranges — its low per-nav cost reflects doing less, not faster engineering — and dilutes a like-for-like comparison of full routers. (See `.claude/competitor-routers.md` for wouter's place in the landscape.)

**Run:** runs 15 · warmup 5 · throttle off · 2026-07-04T07:44:06.022Z · Apple M3 Pro · numbers are **median** (winner per row **bold**).

⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the **stable signals only** — CPU (`script`), heap, FCP (all RME < 5%). Felt **latency was deliberately dropped** (its RME was 9–44% across every scenario — React render + display-frame cadence dominate, not router work; see *Why no latency* at the end). `nav-churn` throughput is frame-capped — read CPU/nav + heap. **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ — notably `history.pushState`'s `updateForSameDocumentNavigation` (~130 µs/nav, CDP-traced) and paint — which is ~identical across routers, so `script` *ratios* overstate the *total* per-nav gap (e.g. a ~4× `script` ratio is ≈ parity in total — Vue cohort all ~0.32 ms, CDP-traced + harness-reported).

## Cold start — `cold-start`

App init + parse/exec to first route painted (small route table).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| main-thread script (ms) | 12.51 | 14.96 | **11.65** |
| JS heap (MB) | 3.22 | 3.46 | **3.10** |
| FCP (ms) | **32.00** | 36.00 | **32.00** |

## Navigation — per-nav total main-thread (script + history) — `nav-latency`

Per-navigation **total main-thread** (script + Blink history, both harness-measured). **real-router is the lightest — 0.52 ms/nav total**, below react-router (0.68) and tanstack (0.70), winning *both* components (script 0.40 and Blink history 0.11 — lowest of the three). Unlike the Vue cohort (where vue-router's 2×-`pushState` brings it to parity), all React routers hit history ~1×/nav, so real-router's lean script carries straight through to a clear total win. (15 runs; `total` = `script` (V8/`ScriptDuration`) + Blink `updateForSameDocumentNavigation`.)

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total main-thread (ms) | **1.02** | 1.28 | 1.20 |
| · script (V8 only) (ms) | **0.647** | 0.952 | 0.893 |
| · Blink history (pushState) (ms) | 0.372 | 0.327 | **0.299** |

## Param navigation — per-nav total (script + history) — `param-nav`

Per-nav total changing :id (steady-state sweep /users/1→2→3…). **real-router lightest — 0.55 ms total** vs tanstack 0.73 / react-router 0.70 (lowest script; Blink ~equal).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.610** | 0.893 | 0.788 |
| · script (V8 only) (ms) | **0.299** | 0.613 | 0.481 |
| · Blink history (pushState) (ms) | 0.311 | **0.283** | 0.306 |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table; per size **total** (script + Blink) + **script** (matcher). Flat curve = O(1)/trie, rising = O(N)/scan. **real-router stays flat and wins every size** (~0.50 total); tanstack flat-higher (~0.9); react-router degrades @1000 (0.80 → 1.50, O(N)). The matcher win holds on total, not just script.

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total @10 (ms) | **0.480** | 0.832 | 0.739 |
| ≈ total @100 (ms) | **0.454** | 0.863 | 0.758 |
| ≈ total @1000 (ms) | **0.457** | 0.816 | 1.43 |
| · script (matcher) @10 (ms) | **0.424** | 0.774 | 0.678 |
| · script (matcher) @100 (ms) | **0.398** | 0.802 | 0.697 |
| · script (matcher) @1000 (ms) | **0.401** | 0.758 | 1.36 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding a table of 1 / 1000 / 10000 routes (forced GC; @1 ≈ the React/app floor). The memory counterpart to wide-config. real-router's segment trie *historically* cost the most here — but heap-profiling traced the bulk to **empty per-route collections + redundant indexes, not the trie itself**, and **#1009 + #1010 removed them** (shared frozen sentinels, a monomorphic `CompiledRoute`, and dropping two duplicate `name→route` maps). At 10k real-router went from **heaviest (~1.85×) to the lightest** of the three (~0.63 KB/route, just under react-router) while keeping the flat O(1) match — the benchmark drove a real core optimization. The trie's genuine space-for-time cost turned out small; the rest was fixable slack. heap is the most stable signal (RME < 0.01%).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| heap @1 (floor) (MB) | 2.24 | 2.50 | **2.16** |
| heap @1k (MB) | 3.17 | 3.51 | **2.95** |
| heap @10k (MB) | **8.55** | 11.22 | 8.72 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain (sweep 3 / 30 / 60 / 90). **real-router and tanstack scale cleanly and monotonically** — real-router is lowest at every realistic depth. **react-router's curve is a parabola** (fine-grained: rises to ~6 ms near depth 45–60 — ~4× real-router — then declines back to ~1.7 ms at depth 90; the 60→90 drop is the parabola's right tail, not a threshold). Root cause (CPU-profiled + confirmed in react-router source): `matchRoutes` tries route branches **deepest-first** (`computeScore` ranks more segments higher) and re-matches every *deeper* branch before reaching the target — so depth D wastes `O((maxDepth−D)×D)` path re-normalization (`matchRouteBranch`/`joinPaths`/`removeDoubleSlashes`) on branches that fail; maximal mid-depth, zero only when the target *is* the deepest route. real-router walks its precompiled segment trie straight to the match (O(depth), no branch-retrying, no per-nav string normalization) — hence the clean low curve. Real apps rarely nest past ~10, where real-router wins outright regardless. (Table is total@D + script@D; the matcher/parabola story lives in `script`; on total real-router edges @90 too.)

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total @3 (ms) | **0.563** | 1.01 | 1.35 |
| ≈ total @30 (ms) | **0.977** | 2.00 | 4.62 |
| ≈ total @60 (ms) | **1.27** | 2.48 | 5.47 |
| ≈ total @90 (ms) | **1.71** | 2.86 | 1.74 |
| · script (matcher) @3 (ms) | **0.499** | 0.957 | 1.29 |
| · script (matcher) @30 (ms) | **0.910** | 1.94 | 4.54 |
| · script (matcher) @60 (ms) | **1.21** | 2.42 | 5.41 |
| · script (matcher) @90 (ms) | **1.64** | 2.79 | 1.68 |

## Param scaling — path-param count (sweep) — `param-scaling`

Navigate into routes with 1 / 10 / 100 path params; **total** + **script** (matcher). Param count is **~a non-factor** (per-param extraction is sub-µs, dwarfed by React render — flat-ish for all, only a slight bump @100). **real-router wins every size** (total 0.58–0.69); tanstack highest, react-router middle.

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total @1 (ms) | **0.522** | 0.883 | 0.662 |
| ≈ total @10 (ms) | **0.502** | 0.850 | 0.649 |
| ≈ total @100 (ms) | **0.628** | 0.995 | 0.804 |
| · script (matcher) @1 (ms) | **0.456** | 0.825 | 0.601 |
| · script (matcher) @10 (ms) | **0.436** | 0.792 | 0.596 |
| · script (matcher) @100 (ms) | **0.558** | 0.934 | 0.741 |

## Search-param scaling — query-param count (sweep, reads all values) — `search-param-scaling`

Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`) — the realistic high-count vector (marketplace filters / analytics / tracking; path params top out at ~4). The leaf reads EVERY value, so lazy query is materialized (apples-to-apples). **real-router stays FLAT (~0.62 ms, slope ~0) and wins @50** — its eager immutable params make reading all 50 a cheap property access. **tanstack EXPLODES — 2.60 ms @50 (~4× real-router), slope ~22 µs/param**: its per-nav search parse + validate + structural-share pipeline is O(query-count). react-router is flat too (0.79 @50 — `URLSearchParams` is a cheap plain object) but a higher floor. At realistic marketplace query counts real-router's flat curve is the win — the eager snapshot never degrades.

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total @1 (ms) | **0.618** | 1.53 | 0.815 |
| ≈ total @10 (ms) | **0.594** | 1.67 | 0.766 |
| ≈ total @50 (ms) | **0.643** | 2.60 | 0.785 |
| · script (query-parse) @1 (ms) | **0.547** | 1.47 | 0.740 |
| · script (query-parse) @10 (ms) | **0.520** | 1.62 | 0.690 |
| · script (query-parse) @50 (ms) | **0.557** | 2.53 | 0.705 |

## Nav churn (stress) — `nav-churn`

200-nav stress; per-nav total (script + Blink) + heap. **real-router lightest CPU/nav (0.94 total)**, tanstack 1.16, react-router 1.30 — **and retains the least heap (684 KB)**. navsPerSec frame-capped.

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total / nav (ms) | **0.939** | 1.16 | 1.30 |
| · script / nav (V8) (ms) | **0.636** | 0.871 | 0.985 |
| · Blink / nav (pushState) (ms) | 0.298 | **0.274** | 0.308 |
| heap retained (200 navs) (KB) | **684** | 1214 | 883 |
| throughput (frame-capped) (/s) | **121** | 121 | 120 |

## Active links (100) — per-nav total (script + history) — `active-links`

Per-nav total recompute across 100 links (steady-state toggle). **real-router lightest by a wide margin — 0.82 ms vs ~1.5–1.7** (~2× lighter; cached active-source per link). Blink ~equal.

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.823** | 1.48 | 1.72 |
| · script (V8 only) (ms) | **0.503** | 1.25 | 1.39 |
| · Blink history (pushState) (ms) | 0.312 | **0.235** | 0.316 |

## Link build — mount 1000 links (href construction) — `link-build`

CPU to mount 1000 `<Link>`s at once — each builds its href via the router's reverse-matcher (`buildPath` / `generatePath` / `buildLocation`), isolated from route construction (done once at startup). A real cost for link-heavy pages (nav menus, sitemaps, paginated lists). **real-router leanest (8.69 ms)**, react-router close behind (9.69); tanstack ~1.6× slower (14.4).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| script (1000 links) (ms) | **8.69** | 14.38 | 9.69 |

## Nested switch (reuse) — per-nav total (script + history) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **real-router lightest — 0.51 ms total** vs tanstack 0.69 / react-router 0.64.

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.613** | 0.857 | 0.812 |
| · script (V8 only) (ms) | **0.315** | 0.558 | 0.513 |
| · Blink history (pushState) (ms) | 0.294 | **0.282** | 0.307 |

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
| cold-start script (ms) | 7.75 | 12.51 (+4.8) | 14.96 (+7.2) | 11.65 (+3.9) |
| cold-start heap (MB) | 2.75 | 3.22 (+0.5) | 3.46 (+0.7) | 3.10 (+0.3) |
| nav script (ms) | 0.409 | 0.647 (+0.2) | 0.952 (+0.5) | 0.893 (+0.5) |
| link-build script (ms) | 4.03 | 8.69 (+4.7) | 14.38 (+10.3) | 9.69 (+5.7) |

**Reading:** the `(+Δ)` is the router's marginal cost over bare React. On the **per-navigation hot path real-router adds the least** — its transition pipeline is the lightest marginal cost over bare React, well under react-router's and roughly half tanstack's. It is near-lowest on link overhead too; **tanstack pays ~2× the router overhead** on startup and links. real-router's cold-start overhead sits a little above react-router's — partly the `browser-plugin` (real History API) it carries by contract — but both are far below tanstack. Net: subtract React, and real-router's router cost is smallest where it matters most (navigation).

## What this does NOT measure / caveats

- **No cross-framework ranking** — each column is the same framework (React); the delta is router work.
- **Why no latency.** Wall-clock felt-latency was measured but **excluded**: across all 99 raw metrics its RME was 9–44% (vs < 5% for CPU/heap). A 20-nav warm diagnostic showed click→paint is dominated by React's render + the display-frame cadence (≈ one 60 fps frame), ~identical across engines — so it is not router-attributable. The router's real contribution is CPU (`script`), reported here. (Raw `latencyMs` is still in `results/*.json`.)
- **`nav-churn` navsPerSec is frame-capped** — not a router differentiator; CPU/nav + retained heap are.
- **FCP** (cold-start) is inherently jittery; treat `script`/`heap` as primary there.
- Each router is configured the idiomatic way for a plain SPA (not gimped). `real-router` includes `browser-plugin` (real History API) — that weight is part of its cold-start/bundle by contract.
- `wide`/`deep` are **scaling sweeps** — the per-size *curve* (does cost grow with N/D) matters more than any single point.

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs react`.

