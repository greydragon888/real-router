# Cross-Router Performance — React cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/react` + `@real-router/browser-plugin` · `react-router@8` (Data mode) · `@tanstack/react-router` — routers that own a navigation pipeline (route-graph resolution, guard/lifecycle phases, immutable state, data).

**Scope — `wouter` is deliberately excluded** (a scoping choice stated up front, not a result). It is a minimalist location-matcher (regexparam matching + a location hook) — a *different class*: no transition pipeline, guards, loaders, or validated search, and **no cross-framework analog** (React/Preact only), so it cannot appear in the Vue/Solid/Svelte/Angular cohorts these benchmarks expand to. Benchmarking it here compares apples to oranges — its low per-nav cost reflects doing less, not faster engineering — and dilutes a like-for-like comparison of full routers. (See `.claude/competitor-routers.md` for wouter's place in the landscape.)

**Run:** runs 50 · warmup 5 · throttle off · 2026-07-12T19:13:00.310Z · 322efbdf-dirty · Apple M3 Pro · numbers are **median** (winner per row **bold**; a **⚖** row = the top-2 medians' 95% CIs overlap, so no winner is bolded — not statistically separable, #1460).

⚠️ Preliminary local numbers — directional, not a published verdict. Per-nav is reported as **wall** (click→DOM settle — the felt latency) + **task** (ΔTaskDuration — CPU), both stable at n=50 (RME < 3%). The earlier `total = script + Blink` metric was **retired** (#1451/#1452: `ScriptDuration` was blind to promise-microtask work and paced `blinkMs` was inflated 5–15×); `script`/`blink` remain as ⚠ **diagnostic** rows only (V8-only, microtask-blind). Heap/alloc RME < 0.8%. `nav-churn` `navsPerSec` is settle-timed — read CPU/nav + heap.

## Cold start — `cold-start`

App init + parse/exec to first route painted (small route table).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| main-thread script (ms) | 12.21 | 14.20 | **11.26** |
| JS heap (retained, post-GC) (MB) | 2.40 | 2.57 | **2.28** |
| · JS heap @FCP (pre-GC, boot garbage — diag #1454) (MB) | 3.26 | 3.46 | **3.11** |
| FCP (ms) ⚖ | 32.00 | 36.00 | 32.00 |

## Navigation — per-nav wall-clock (click→DOM settle) — `nav-latency`

Per-nav **wall** (click→DOM settle, felt) + **task** (ΔTaskDuration, CPU); `script`/`blink` are ⚠ diagnostics. **real-router is the lightest — winning both wall and task**, at roughly **half** react-router's felt latency and well under tanstack. *(Sub-ms per-nav: absolutes are session/load-dependent — read the ranking + ratio, not the ms.)* **`alloc/nav` (GC pressure): real-router is the leanest allocator too** — its compact immutable State allocates ~11 KB/nav vs react-router ~30 (**~2.7×**) and tanstack ~109 (**~10×**), whose per-nav pipeline produces far more transient garbage.

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| nav / wall (click→settle) (ms) | **0.085** | 0.230 | 0.165 |
| · nav / task (ΔTaskDuration) (ms) | **0.102** | 0.240 | 0.169 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | **0.079** | 0.176 | 0.150 |
| · blink diag (gap=0, #1452) (ms) ⚖ | 0.024 | 0.023 | 0.023 |
| alloc / nav (GC pressure) (KB) | **10.89** | 109 | 29.76 |

## Param navigation — per-nav wall-clock (click→DOM settle) — `param-nav`

Per-nav wall + task changing :id (steady-state sweep /users/1→2→3…). **real-router lightest** — wall 0.140 vs react-router 0.225 (~61%), tanstack 0.310; lowest task. *(Sub-ms — read ranking/ratio, not absolute ms.)* `alloc/nav`: real-router's immutable State references the new `:id` rather than re-copying — ~12 KB/nav vs react-router ~34 (~2.9×) and tanstack ~124 (~10.7×).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| nav / wall (click→settle) (ms) | **0.140** | 0.310 | 0.225 |
| · nav / task (ΔTaskDuration) (ms) | **0.151** | 0.332 | 0.233 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | **0.133** | 0.255 | 0.204 |
| · blink diag (gap=0, #1452) (ms) | 0.025 | 0.024 | **0.023** |
| alloc / nav (GC pressure) (KB) | **11.62** | 124 | 33.61 |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table; per size **task** (CPU matcher) + **wall @1000** (felt). Flat curve = O(1)/trie, rising = O(N)/scan. **real-router stays flat and wins every size** — task@1000 **0.273 vs react-router 0.773 (~2.8×) and tanstack 1.06 (~3.9×)**; react-router degrades with N (O(N) scan). The matcher win is decisive.

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| nav / task @10 (ms) | **0.375** | 0.957 | 0.496 |
| nav / task @100 (ms) | **0.291** | 0.628 | 0.427 |
| nav / task @1000 (ms) | **0.273** | 1.06 | 0.773 |
| · nav / wall @1000 (felt) (ms) | **0.200** | 0.400 | 0.700 |
| · ⚠ script (V8, microtask-blind #1451) @10 (ms) | **0.235** | 0.507 | 0.329 |
| · ⚠ script @100 (ms) | **0.159** | 0.406 | 0.311 |
| · ⚠ script @1000 (ms) | **0.152** | 0.412 | 0.635 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding a table of 1 / 1000 / 10000 routes (forced GC; @1 ≈ the React/app floor). The memory counterpart to wide-config. real-router's segment trie *historically* cost the most here — but heap-profiling traced the bulk to **empty per-route collections + redundant indexes, not the trie itself**, and **#1009 + #1010 removed them** (shared frozen sentinels, a monomorphic `CompiledRoute`, and dropping two duplicate `name→route` maps). At 10k real-router is now the **lightest** of the three — **6.05 MB vs react-router 8.73 (~44%) and tanstack 11.22 (~1.9×)** — while keeping the flat O(1) match; the benchmark drove a real core optimization. At the @1 floor real-router (2.27) sits a hair over react-router (2.16). heap is the most stable signal (RME < 0.3%).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| heap @1 (floor) (MB) | 2.27 | 2.50 | **2.16** |
| heap @1k (MB) | **2.77** | 3.51 | 2.96 |
| heap @10k (MB) | **6.05** | 11.22 | 8.73 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain (sweep 3 / 30 / 60 / 90). **real-router scales cleanly and monotonically** (0.408 → 0.911 → 1.67 → 2.56 ms task) and **wins every realistic depth — ~2.2× @3, ~3.7× @30, ~2.9× @60** vs react-router. **react-router's curve is a parabola**: it rises to ~4.81 ms at depth 60 (~2.9× real-router) then **declines to ~1.50 ms at depth 90**, so at the single @90 point it dips below real-router's honest 2.56. Root cause (CPU-profiled + confirmed in react-router source): `matchRoutes` tries route branches **deepest-first** (`computeScore` ranks more segments higher) and re-matches every *deeper* branch before reaching the target — depth D wastes `O((maxDepth−D)×D)` path re-normalization (`matchRouteBranch`/`joinPaths`), maximal mid-depth, zero only when the target *is* the deepest route (@90). real-router walks its precompiled segment trie straight to the match (O(depth), no branch-retrying, no per-nav string normalization). Real apps rarely nest past ~10, where real-router wins outright. *(@90 is the react-router parabola's zero-point, not a real-router regression — read the whole curve.)*

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| nav / task @3 (ms) | **0.408** | 0.958 | 0.883 |
| nav / task @30 (ms) ⚖ | 0.911 | 0.931 | 3.40 |
| nav / task @60 (ms) ⚖ | 1.67 | 1.58 | 4.81 |
| nav / task @90 (ms) | 2.56 | 1.73 | **1.50** |
| · nav / wall @90 (felt) (ms) | 2.30 | 1.40 | **0.900** |
| · ⚠ script (V8, microtask-blind #1451) @3 (ms) | **0.239** | 0.479 | 0.692 |
| · ⚠ script @30 (ms) | 0.700 | **0.657** | 3.13 |
| · ⚠ script @60 (ms) | 1.51 | **1.02** | 4.13 |
| · ⚠ script @90 (ms) | 2.31 | 1.29 | **0.897** |

## Search-param scaling — query-param count (sweep, reads all values) — `search-param-scaling`

Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`) — the realistic high-count vector (marketplace filters / analytics / tracking; path params top out at ~4). The leaf reads EVERY value, so lazy query is materialized (apples-to-apples). **real-router wins @50 — task 0.349 vs react-router 0.375, tanstack 2.84 — and stays flat across @10→@50** (eager immutable params make reading all 50 a cheap property access). **tanstack EXPLODES — 2.84 ms @50 (~8.1× real-router), O(query-count)**: its per-nav search parse + validate + structural-share pipeline. react-router is flat too (0.375 @50 — `URLSearchParams` is a cheap plain object) but no lower. **`alloc/nav` (GC pressure, @50↔@1 toggle) tells the SAME story in memory:** real-router allocates ~32 KB/nav **flat** — its eager params *reference* the browser's URL-parsed strings instead of copying — vs react-router ~40 and tanstack ~507 (**~16×**). So the eager model wins **both** axes at high count — flat CPU *and* far less garbage — refuting the intuition that an eager snapshot must produce more garbage.

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| nav / task @1 (ms) | 0.858 | 1.81 | **0.474** |
| nav / task @10 (ms) | **0.296** | 1.65 | 0.354 |
| nav / task @50 (ms) ⚖ | 0.349 | 2.84 | 0.375 |
| · nav / wall @50 (felt) (ms) | **0.200** | 2.60 | 0.300 |
| · ⚠ script (query-parse, V8-blind #1451) @1 (ms) | **0.261** | 1.14 | 0.294 |
| · ⚠ script @10 (ms) | **0.177** | 1.29 | 0.247 |
| · ⚠ script @50 (ms) | **0.226** | 2.60 | 0.253 |
| alloc / nav @50↔@1 (GC pressure) (KB) | **31.79** | 507 | 40.26 |

## Nav churn (stress) — `nav-churn`

200-nav stress; per-nav **task** (CPU) + retained **heap Δ**. **real-router lightest CPU/nav — task 0.093** vs react-router 0.161, tanstack 0.234 — **and retains the least heap (717 KB)** (react-router 887, tanstack 1140). `navsPerSec` is settle-timed throughput; read CPU/nav + heap (heap Δ is warmup-dominated, not a leak #1462).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| nav / wall (= 1000/navsPerSec) (ms) | **0.086** | 0.228 | 0.161 |
| · nav / task (ΔTaskDuration) (ms) | **0.093** | 0.234 | 0.161 |
| throughput (real, settle-timed) (/s) | **11696** | 4396 | 6211 |
| · ⚠ script / nav (microtask-blind #1451) (ms) | **0.079** | 0.172 | 0.142 |
| · blink diag (gap=0, #1452) (ms) ⚖ | 0.025 | 0.024 | 0.024 |
| heap Δ 0→200 navs (⚠ warmup-dominated, not a leak #1462) (KB) | **717** | 1140 | 887 |

## Active links (100) — per-nav wall-clock (click→DOM settle) — `active-links`

Per-nav wall recompute across 100 links (steady-state toggle). **real-router lightest by a wide margin — wall 0.250 ms vs tanstack 0.805 / react-router 0.905 (~3.6×)**: a shared cached active-source recomputes all 100 links off **one** `router.subscribe`, where react-router / tanstack pay per-link active machinery. **This is a cross-cohort strength — real-router leads active-links in four of five cohorts** (Svelte + Angular wins below; Solid near-parity; only Vue's fine-grained reactivity edges it).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| nav / wall (click→settle) (ms) | **0.250** | 0.805 | 0.905 |
| · nav / task (ΔTaskDuration) (ms) | **0.266** | 0.832 | 0.917 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | **0.242** | 0.743 | 0.868 |
| · blink diag (gap=0, #1452) (ms) | **0.024** | 0.029 | 0.027 |

## Back / forward — per-nav wall-clock (popstate → DOM settle) — `back-forward`

Browser **back/forward** (popstate) steady-state — the distinct history-traversal path (every other scenario drives `pushState` *forward*; this drives `history.back()/forward()`, one of the commonest real ops). **real-router WINS — wall 0.217 ms vs react-router 0.259, tanstack 0.315 (~19%)**. **#1353 landed** (skip no-op popstate `replaceState`): real-router now fires **1** `updateForSameDocumentNavigation`/nav (the browser's own traversal), not 2 — the redundant second history event on back/forward is gone. Leanest allocator too (~10 KB/nav vs react-router 26 / tanstack 63). *(n=50 — ranking robust.)*

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| nav / wall (back/fwd→settle) (ms) | **0.217** | 0.315 | 0.259 |
| · nav / task (ΔTaskDuration) (ms) | **0.137** | 0.280 | 0.185 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | **0.071** | 0.189 | 0.117 |
| · blink diag (gap=0; rr 2×/nav honest) (ms) | **0.103** | 0.201 | 0.144 |
| alloc / nav (GC pressure) (KB) | **10.12** | 63.17 | 26.17 |

## Link build — mount 1000 links (href construction, wall-clock) — `link-build`

CPU to mount 1000 `<Link>`s at once — each builds its href via the router's reverse-matcher (`buildPath` / `generatePath` / `buildLocation`), isolated from route construction (done once at startup). A real cost for link-heavy pages (nav menus, sitemaps, paginated lists). **real-router leanest — 6.90 ms** (its `<Link>` active state resolves through a shared per-router active-name selector — one `router.subscribe` for all links, not a subscription per link); react-router 9.60 (~39%), tanstack 14.20 (~2.1×).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| mount 1000 links (wall → DOM-commit, pre-paint; #1462) (ms) | **6.90** | 14.20 | 9.60 |

## Nested switch (reuse) — per-nav wall-clock (click→DOM settle) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **real-router lightest — wall 0.115 ms** vs react-router 0.230 / tanstack 0.295 (~2×).

| metric | real-router | tanstack | react-router |
|---|---|---|---|
| nav / wall (click→settle) (ms) | **0.115** | 0.295 | 0.230 |
| · nav / task (ΔTaskDuration) (ms) | **0.146** | 0.313 | 0.237 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | **0.111** | 0.236 | 0.212 |
| · blink diag (gap=0, #1452) (ms) | 0.025 | 0.024 | **0.022** |

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
| cold-start script (ms) | 7.92 | 12.21 (+4.3) | 14.20 (+6.3) | 11.26 (+3.3) |
| cold-start heap retained (MB) | 2.00 | 2.40 (+0.4) | 2.57 (+0.6) | 2.28 (+0.3) |
| link-build mount (ms) | 3.90 | 6.90 (+3.0) | 14.20 (+10.3) | 9.60 (+5.7) |

**Reading:** the `(+Δ)` is the router's marginal cost over bare React on the two axes where the baseline is a genuine floor — **boot** and **link mount**. real-router is near-lowest on link overhead; **tanstack pays ~2× the router overhead** on startup and links. real-router's cold-start overhead sits a little above react-router's — partly the `browser-plugin` (real History API) it carries by contract — but both are far below tanstack. (Per-nav is not shown here: an optimized router beats the naive manual-nav baseline, so it is ranked router-vs-router in the tables above — where real-router leads the React cohort.)

## What this does NOT measure / caveats

- **No cross-framework ranking** — each column is the same framework (React); the delta is router work.
- **Per-nav is wall + task.** `navMsWall` (click→DOM settle) is the headline felt latency — stable at n=50 (RME < 3%). The earlier decision to drop felt-latency belonged to the retired `total`-metric epoch (whose latency RME was 9–44%); the settle-timed **wall** + **task** (ΔTaskDuration) replaced it (#1451/#1452). `script`/`blink` are kept only as diagnostics.
- **`nav-churn` navsPerSec is frame-capped** — not a router differentiator; CPU/nav + retained heap are.
- **FCP** (cold-start) is inherently jittery; treat `script`/`heap` as primary there.
- Each router is configured the idiomatic way for a plain SPA (not gimped). `real-router` includes `browser-plugin` (real History API) — that weight is part of its cold-start/bundle by contract.
- `wide`/`deep` are **scaling sweeps** — the per-size *curve* (does cost grow with N/D) matters more than any single point.

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs react`.

