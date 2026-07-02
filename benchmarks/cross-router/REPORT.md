# Cross-Router Performance — React cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/react` + `@real-router/browser-plugin` · `react-router@8` (Data mode) · `@tanstack/react-router` — routers that own a navigation pipeline (route-graph resolution, guard/lifecycle phases, immutable state, data).

**Scope — `wouter` is deliberately excluded** (a scoping choice stated up front, not a result). It is a minimalist location-matcher (regexparam matching + a location hook) — a *different class*: no transition pipeline, guards, loaders, or validated search, and **no cross-framework analog** (React/Preact only), so it cannot appear in the Vue/Solid/Svelte/Angular cohorts these benchmarks expand to. Benchmarking it here compares apples to oranges — its low per-nav cost reflects doing less, not faster engineering — and dilutes a like-for-like comparison of full routers. (See `.claude/competitor-routers.md` for wouter's place in the landscape.)

**Run:** runs 15 · warmup 5 · throttle off · 2026-06-28T03:38:33.314Z · Apple M3 Pro · numbers are **median** (winner per row **bold**).

⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the **stable signals only** — CPU (`script`), heap, FCP (all RME < 5%). Felt **latency was deliberately dropped** (its RME was 9–44% across every scenario — React render + display-frame cadence dominate, not router work; see *Why no latency* at the end). `nav-churn` throughput is frame-capped — read CPU/nav + heap. **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ — notably `history.pushState`'s `updateForSameDocumentNavigation` (~130 µs/nav, CDP-traced) and paint — which is ~identical across routers, so `script` *ratios* overstate the *total* per-nav gap (e.g. a ~4× `script` ratio is ≈ parity in total — Vue cohort all ~0.32 ms, CDP-traced + harness-reported).

## Cold start — `cold-start`

App init + parse/exec to first route painted (small route table).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| main-thread script (ms) | 12.27 | 14.79 | **12.09** |
| JS heap (MB) | 3.21 | 3.44 | **3.10** |
| FCP (ms) | **32.00** | 36.00 | **32.00** |

## Navigation — single client nav (CPU) — `nav-latency`

Per-navigation **total main-thread** (script + Blink history, both harness-measured). **real-router is the lightest — 0.52 ms/nav total**, below react-router (0.68) and tanstack (0.70), winning *both* components (script 0.40 and Blink history 0.11 — lowest of the three). Unlike the Vue cohort (where vue-router's 2×-`pushState` brings it to parity), all React routers hit history ~1×/nav, so real-router's lean script carries straight through to a clear total win. (15 runs.)

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| **≈ total main-thread (ms)** | **0.519** | 0.696 | 0.679 |
| · script — V8 only (`ScriptDuration`) (ms) | **0.401** | 0.538 | 0.502 |
| · Blink history — `pushState` (ms) | **0.113** | 0.188 | 0.144 |

_15 runs. `total` = `script` (V8) + Blink history (`updateForSameDocumentNavigation`), both harness-measured. real-router wins all three._

## Param navigation (CPU) — `param-nav`

Per-navigation **total main-thread** changing :id (steady-state sweep /users/1→2→3…). **real-router is the lightest — 0.55 ms total** vs tanstack 0.73, react-router 0.70 (lowest script 0.44; Blink ~equal). (10 runs.)

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| **≈ total main-thread (ms)** | **0.546** | 0.725 | 0.696 |
| · script — V8 only (ms) | **0.438** | 0.496 | 0.595 |
| · Blink history — `pushState` (ms) | 0.107 | 0.223 | **0.099** |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table; per size **total** (script + Blink) + **script** (matcher). Flat curve = O(1)/trie, rising = O(N)/scan. **real-router stays flat and wins every size** (~0.50 total); tanstack flat-higher (~0.9); react-router degrades @1000 (0.80 → 1.50, O(N)). The matcher win holds on total, not just script. (10 runs.)

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total @10 (ms) | **0.541** | 0.886 | 0.803 |
| ≈ total @100 (ms) | **0.498** | 0.910 | 0.816 |
| ≈ total @1000 (ms) | **0.506** | 0.894 | 1.503 |
| · script (matcher) @10 (ms) | **0.470** | 0.824 | 0.731 |
| · script (matcher) @100 (ms) | **0.435** | 0.843 | 0.752 |
| · script (matcher) @1000 (ms) | **0.444** | 0.834 | 1.409 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding a table of 1 / 1000 / 10000 routes (forced GC; @1 ≈ the React/app floor). The memory counterpart to wide-config. real-router's segment trie *historically* cost the most here — but heap-profiling traced the bulk to **empty per-route collections + redundant indexes, not the trie itself**, and **#1009 + #1010 removed them** (shared frozen sentinels, a monomorphic `CompiledRoute`, and dropping two duplicate `name→route` maps). At 10k real-router went from **heaviest (~1.85×) to the lightest** of the three (~0.63 KB/route, just under react-router) while keeping the flat O(1) match — the benchmark drove a real core optimization. The trie's genuine space-for-time cost turned out small; the rest was fixable slack. heap is the most stable signal (RME < 0.01%).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| heap @1 (floor) (MB) | 2.23 | 2.49 | **2.16** |
| heap @1k (MB) | 3.14 | 3.50 | **2.95** |
| heap @10k (MB) | **8.53** | 11.21 | 8.72 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain (sweep 3 / 30 / 60 / 90). **real-router and tanstack scale cleanly and monotonically** — real-router is lowest at every realistic depth. **react-router's curve is a parabola** (fine-grained: rises to ~6 ms near depth 45–60 — ~4× real-router — then declines back to ~1.7 ms at depth 90; the 60→90 drop is the parabola's right tail, not a threshold). Root cause (CPU-profiled + confirmed in react-router source): `matchRoutes` tries route branches **deepest-first** (`computeScore` ranks more segments higher) and re-matches every *deeper* branch before reaching the target — so depth D wastes `O((maxDepth−D)×D)` path re-normalization (`matchRouteBranch`/`joinPaths`/`removeDoubleSlashes`) on branches that fail; maximal mid-depth, zero only when the target *is* the deepest route. real-router walks its precompiled segment trie straight to the match (O(depth), no branch-retrying, no per-nav string normalization) — hence the clean low curve. Real apps rarely nest past ~10, where real-router wins outright regardless. (Table is total@D + script@D; the matcher/parabola story lives in `script`. On total real-router edges @90 too.)

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total @3 (ms) | **0.599** | 1.104 | 1.468 |
| ≈ total @30 (ms) | **1.057** | 2.119 | 5.024 |
| ≈ total @60 (ms) | **1.426** | 2.857 | 5.922 |
| ≈ total @90 (ms) | **1.848** | 3.337 | 1.887 |
| · script (matcher) @3 (ms) | **0.535** | 1.035 | 1.396 |
| · script (matcher) @30 (ms) | **0.983** | 2.047 | 4.949 |
| · script (matcher) @60 (ms) | **1.356** | 2.786 | 5.847 |
| · script (matcher) @90 (ms) | **1.788** | 3.266 | 1.819 |

## Param scaling — path-param count (sweep) — `param-scaling`

Navigate into routes with 1 / 10 / 100 path params; **total** + **script** (matcher). Param count is **~a non-factor** (per-param extraction is sub-µs, dwarfed by React render — flat-ish for all, only a slight bump @100). **real-router wins every size** (total 0.58–0.69); tanstack highest, react-router middle. (10 runs.)

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total @1 (ms) | **0.580** | 0.957 | 0.718 |
| ≈ total @10 (ms) | **0.575** | 0.891 | 0.696 |
| ≈ total @100 (ms) | **0.690** | 1.145 | 0.843 |
| · script (matcher) @1 (ms) | **0.510** | 0.895 | 0.648 |
| · script (matcher) @10 (ms) | **0.505** | 0.833 | 0.637 |
| · script (matcher) @100 (ms) | **0.615** | 1.072 | 0.769 |

## Nav churn (stress) — `nav-churn`

200 navigations toggling 2 routes; per-nav total (script + Blink) + retained heap. **react-router has the lightest CPU/nav (0.55 total)**, real-router 0.77, tanstack 1.13 — but **real-router retains the least heap (692 KB vs 881 / 1217)**. navsPerSec is frame-capped (~equal). (10 runs.)

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| ≈ total / nav (ms) | 0.765 | 1.128 | **0.550** |
| · script / nav (V8) (ms) | 0.527 | 0.835 | **0.417** |
| · Blink / nav (`pushState`) (ms) | 0.154 | 0.284 | **0.096** |
| heap retained (200 navs) (KB) | **692** | 1217 | 881 |
| throughput (frame-capped) (/s) | 121 | 122 | **122** |

## Active links (100) — recompute CPU — `active-links`

Per-navigation **total** recompute across 100 mounted links (steady-state toggle /tab/1↔2). **real-router is the lightest by a wide margin — 0.79 ms total** vs tanstack 1.52, react-router 1.60 (~2× heavier): real-router's cached active-source per link pays off — its script (0.51) is ~2.6× lower than the React competitors' (~1.3). Blink ~equal (~0.25). (10 runs.)

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| **≈ total main-thread (ms)** | **0.792** | 1.521 | 1.597 |
| · script — V8 only (ms) | **0.510** | 1.300 | 1.324 |
| · Blink history — `pushState` (ms) | 0.287 | **0.234** | 0.277 |

## Link build — mount 1000 links (href construction) — `link-build`

CPU to mount 1000 `<Link>`s at once — each builds its href via the router's reverse-matcher (`buildPath` / `generatePath` / `buildLocation`), isolated from route construction (done once at startup). A real cost for link-heavy pages (nav menus, sitemaps, paginated lists). real-router and react-router are **close** (~10 ms, the ranking flips run-to-run); tanstack is ~1.6× slower.

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| script (1000 links) (ms) | 10.86 | 16.53 | **10.09** |

## Nested switch (reuse) — CPU — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state toggle) — low total ≈ the router reuses the parent and only swaps the leaf. **real-router is the lightest — 0.51 ms total** vs tanstack 0.69, react-router 0.64. (10 runs.)

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| **≈ total main-thread (ms)** | **0.510** | 0.691 | 0.636 |
| · script — V8 only (ms) | **0.292** | 0.527 | 0.436 |
| · Blink history — `pushState` (ms) | 0.174 | **0.141** | 0.166 |

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
| cold-start script (ms) | 8.33 | 12.27 (+3.9) | 14.79 (+6.5) | 12.09 (+3.8) |
| cold-start heap (MB) | 2.75 | 3.21 (+0.5) | 3.44 (+0.7) | 3.10 (+0.3) |
| nav script (ms) | 0.278 | 0.377 (+0.1) | 0.506 (+0.2) | 0.584 (+0.3) |
| link-build script (ms) | 4.33 | 10.86 (+6.5) | 16.53 (+12.2) | 10.09 (+5.8) |

**Reading:** the `(+Δ)` is the router's marginal cost over bare React. On the **per-navigation hot path real-router adds the least** — its transition pipeline is the lightest marginal cost over bare React, well under react-router's and roughly half tanstack's. It is near-lowest on link overhead too; **tanstack pays ~2× the router overhead** on startup and links. real-router's cold-start overhead sits a little above react-router's — partly the `browser-plugin` (real History API) it carries by contract — but both are far below tanstack. Net: subtract React, and real-router's router cost is smallest where it matters most (navigation).

## What this does NOT measure / caveats

- **No cross-framework ranking** — each column is the same framework (React); the delta is router work.
- **Why no latency.** Wall-clock felt-latency was measured but **excluded**: across all 99 raw metrics its RME was 9–44% (vs < 5% for CPU/heap). A 20-nav warm diagnostic showed click→paint is dominated by React's render + the display-frame cadence (≈ one 60 fps frame), ~identical across engines — so it is not router-attributable. The router's real contribution is CPU (`script`), reported here. (Raw `latencyMs` is still in `results/*.json`.)
- **`nav-churn` navsPerSec is frame-capped** — not a router differentiator; CPU/nav + retained heap are.
- **FCP** (cold-start) is inherently jittery; treat `script`/`heap` as primary there.
- Each router is configured the idiomatic way for a plain SPA (not gimped). `real-router` includes `browser-plugin` (real History API) — that weight is part of its cold-start/bundle by contract.
- `wide`/`deep` are **scaling sweeps** — the per-size *curve* (does cost grow with N/D) matters more than any single point.

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs react`.

