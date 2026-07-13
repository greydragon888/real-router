# Cross-Router Performance — Svelte cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/svelte` · `sv-router` (community Svelte-5-first router — **framework-native / Svelte-coupled**: borrows Svelte 5 runes for state, O(N) sort+scan matcher, boolean-blocker guards, plain `<a href>` links) · `@mateothegreat/svelte5-router` — Svelte 5 SFC apps (`vite-plugin-svelte`, `dedupe: ['svelte']`). **No `@tanstack/svelte-router` exists** (npm 404), so this cohort has no TanStack column; the popular `svelte-spa-router` (hash + regex) and `svelte-routing` are minimalist-class and excluded like `wouter`, and SvelteKit is framework-bundled (not a standalone router).

**Scope — three full routers, like-for-like** (SvelteKit + hash/minimalist routers excluded). The honest split has **two axes plus a capability axis**. **Matcher scale** (`wide-config`): **real-router wins** — its segment trie stays flat @1000 (0.23) while sv-router degrades O(N) (0.475) and mateo-router floors high (0.52); the structural trie win holds in Svelte (as in React/Vue). **Per-nav render + memory** (cold-start, nav-latency, param-nav, nav-churn, table-heap, nested-switch, link-build): **sv-router wins** — a remarkably lean router (heap @10k 2.27 MB vs real-router 5.90; link-build 3.2 ms vs 12.1). But that leanness is **architectural, not just "does less"**: sv-router borrows Svelte 5 runes for reactivity (no state engine of its own), matches by O(N) sort+scan (not a trie), ships boolean-blocker guards (not real-router's `canDeactivate`/leave-approve lifecycle), and uses plain `<a href>` (not a reverse-matching `<Link>`). **The real axis is framework-native vs framework-agnostic:** sv-router is lean *because* it is Svelte-only and compile-friendly; real-router pays for carrying its own immutable state across 8 frameworks, an O(1) trie that wins at scale, and a full guard/search/scroll pipeline — and a Svelte dev choosing it gets the same router + pipeline in their React/Vue/etc. projects too. Not minimalist (it has nested layouts, data hooks, preload — unlike the excluded `svelte-spa-router`), just at the lean end of "full". **Capability**: **real-router is the ONLY full-pipeline router** (guards + validated search + data + scroll); sv-router covers data + guard, mateo-router guard only. real-router's adapter soft-spots: deep-nesting `RouteView` O(depth) (#1094) and a heavy `<Link>` (link-build 12.1 ms — `buildPath` + per-component instantiation, the residual after #1101's shared-selector fix). mateo-router renders depth 90 (no error boundary, unlike `@tanstack/solid-router`).

**Run:** runs 50 · warmup 5 · throttle off · 2026-07-12T19:33:59.254Z · 322efbdf-dirty · Apple M3 Pro · numbers are **median** (winner per row **bold**; a **⚖** row = the top-2 medians' 95% CIs overlap, so no winner is bolded — not statistically separable, #1460).

⚠️ Preliminary local numbers — directional, not a published verdict. Per-nav is **wall** (click→DOM settle — felt) + **task** (ΔTaskDuration — CPU), RME < 3% at n=50; the `total = script + Blink` metric was **retired** (#1451/#1452); `script`/`blink` are ⚠ **diagnostics** (V8-only, microtask-blind). `nav-churn` navsPerSec is settle-timed here — read CPU/nav + heap.

## Cold start — `cold-start`

App init + parse/exec to first route painted. **sv-router is the lightest to boot** (script 3.58 ms, heap 1.85 MB); mateo-router 4.00 ms / 1.89 MB; real-router heaviest (5.16 ms / 2.20 MB). Over the bare-Svelte floor real-router adds the most boot cost (#1106).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| main-thread script (ms) | 5.16 | **3.58** | 4.00 |
| JS heap (retained, post-GC) (MB) | 2.20 | **1.85** | 1.89 |
| · JS heap @FCP (pre-GC, boot garbage — diag #1454) (MB) | 3.01 | **2.55** | 2.61 |
| FCP (ms) | 24.00 | 20.00 | **16.00** |

## Navigation — per-nav wall-clock (click→DOM settle) — `nav-latency`

Per-nav **wall** (click→DOM settle, felt) + **task** (CPU). **A near-tie at the Svelte floor — real-router edges the felt wall (0.073 vs sv-router 0.082, mateo-router 0.090); task a dead heat (0.086 ≈ 0.087).** sv-router's `script` sits at the bare-Svelte floor (minimal pipeline); on the settle-timed wall real-router's single `pushState` keeps it just ahead. *(Sub-ms — the ranking is tight and session/load-dependent; read it as floor-parity.)*

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| nav / wall (click→settle) (ms) | **0.073** | 0.082 | 0.090 |
| · nav / task (ΔTaskDuration) (ms) ⚖ | 0.086 | 0.087 | 0.105 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | 0.066 | **0.036** | 0.073 |
| · blink diag (gap=0, #1452) (ms) ⚖ | 0.023 | 0.023 | 0.023 |
| alloc / nav (GC pressure) (KB) ⚖ | 12.51 | 12.47 | 19.86 |

## Param navigation — per-nav wall-clock (click→DOM settle) — `param-nav`

Per-nav wall + task changing :id (steady-state). **sv-router leanest (wall 0.080); real-router second (0.093, ~16%); mateo-router third (0.140)** — sv-router's minimal reactive model sits just below real-router's eager pipeline. *(Sub-ms — session/load-dependent.)*

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| nav / wall (click→settle) (ms) | 0.093 | **0.080** | 0.140 |
| · nav / task (ΔTaskDuration) (ms) | 0.122 | **0.109** | 0.150 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | 0.084 | **0.032** | 0.118 |
| · blink diag (gap=0, #1452) (ms) ⚖ | 0.024 | 0.024 | 0.024 |
| alloc / nav (GC pressure) (KB) | **11.09** | 12.61 | 25.93 |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table — **the matcher crossover, and real-router's clearest win in this cohort.** real-router's segment trie stays FLAT (task ~0.233 across @10/@100/@1000) while **sv-router degrades O(N)** (0.475 @1000 — it sorts + scans its route-key list per nav, NOT a segment trie) and mateo-router carries a high floor (~0.519). **real-router WINS @1000** — task 0.233 vs sv-router 0.475 (~2×), mateo 0.519 — the structural trie advantage holds in Svelte (as in React/Vue/Solid).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| nav / task @10 (ms) | **0.296** | 0.568 | 0.718 |
| nav / task @100 (ms) | **0.225** | 0.288 | 0.732 |
| nav / task @1000 (ms) | **0.233** | 0.475 | 0.519 |
| · nav / wall @1000 (felt) (ms) | **0.100** | 0.350 | 0.350 |
| · ⚠ script (V8, microtask-blind #1451) @10 (ms) | 0.130 | **0.103** | 0.374 |
| · ⚠ script @100 (ms) | 0.118 | **0.101** | 0.365 |
| · ⚠ script @1000 (ms) | **0.116** | 0.271 | 0.341 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **sv-router wins decisively — 2.27 MB @10k** (its route table is a plain object map, near-flat with count), vs real-router 5.90 and mateo-router 9.20 (heaviest). Unlike the React/Vue cohorts where real-router's trie was the memory winner, sv-router's minimal storage is far leaner here.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| heap @1 (floor) (MB) | 2.06 | **1.82** | 1.87 |
| heap @1k (MB) | 2.59 | **1.97** | 2.70 |
| heap @10k (MB) | 5.90 | **2.27** | 9.20 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain. **All three rise O(depth)** — sv-router leanest (2.07 @90), real-router second (0.415 → 3.23 @90), mateo-router heaviest (3.27). **Read directionally:** #1094's Solid research found the analogous deep rise was ~60% a *Solid-specific* bench-app artifact plus adapter bugs; the Svelte deep cost has **not** been decomposed the same way, so the split between app-structure and `@real-router/svelte` `RouteView` composition here is open (the core matcher is flat-capable). **mateo-router renders depth 90 fine** — unlike `@tanstack/solid-router`, which errored past ~30 in the Solid cohort. Real apps rarely nest past ~10.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| nav / task @3 (ms) | 0.415 | **0.343** | 0.526 |
| nav / task @30 (ms) | 0.869 | **0.692** | 1.35 |
| nav / task @60 (ms) | 1.87 | **1.54** | 2.41 |
| nav / task @90 (ms) | 3.23 | **2.07** | 3.27 |
| · nav / wall @90 (felt) (ms) | 2.95 | **1.95** | 3.00 |
| · ⚠ script (V8, microtask-blind #1451) @3 (ms) | 0.231 | **0.123** | 0.309 |
| · ⚠ script @30 (ms) | 0.703 | **0.490** | 1.03 |
| · ⚠ script @60 (ms) | 1.68 | **1.10** | 1.87 |
| · ⚠ script @90 (ms) | 2.91 | **1.87** | 2.47 |

## Search-param scaling — query-param count (sweep, reads all values) — `search-param-scaling`

Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`, the realistic high-count vector), reading every value. **real-router is FLAT and WINS @50 — task 0.281 vs sv-router 0.487, mateo-router 0.501** (eager immutable params): sv-router leads at @1 (its lazy reactive `route.search` is cheap for few params) but RISES with count, and real-router's flat curve overtakes it by @50; mateo-router rises steepest. Reading all values at the realistic high-count end is exactly where eager materialization beats per-read reactive query. **`alloc/nav`** (GC pressure): real-router ~19 KB/nav vs sv-router ~34 / mateo ~111 — eager params reference URL-parsed strings, flat with count.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| nav / task @1 (ms) ⚖ | 0.696 | 0.360 | 0.372 |
| nav / task @10 (ms) ⚖ | 0.228 | 0.257 | 0.309 |
| nav / task @50 (ms) | **0.281** | 0.487 | 0.501 |
| · nav / wall @50 (felt) (ms) | **0.200** | 0.300 | 0.300 |
| · ⚠ script (query-parse, V8-blind #1451) @1 (ms) | 0.168 | **0.112** | 0.167 |
| · ⚠ script @10 (ms) | 0.126 | **0.074** | 0.176 |
| · ⚠ script @50 (ms) | 0.153 | **0.111** | 0.289 |
| alloc / nav @50↔@1 (GC pressure) (KB) | **19.21** | 33.74 | 111 |

## Nav churn (stress) — `nav-churn`

200-nav stress; per-nav **task** (CPU) + retained **heap Δ**. **CPU/nav a 3-way tie (~0.078 task).** sv-router retains the least heap (247 KB), mateo-router 303, real-router 396 (heaviest here). `navsPerSec` is settle-timed ~14k/s for all three — read CPU/nav + heap (heap Δ warmup-dominated, not a leak #1462).

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| nav / wall (= 1000/navsPerSec) (ms) | **0.071** | 0.072 | 0.075 |
| · nav / task (ΔTaskDuration) (ms) | **0.078** | 0.080 | 0.081 |
| throughput (real, settle-timed) (/s) | **14085** | 13889 | 13423 |
| · ⚠ script / nav (microtask-blind #1451) (ms) | 0.064 | **0.029** | 0.060 |
| · blink diag (gap=0, #1452) (ms) ⚖ | 0.024 | 0.025 | 0.024 |
| heap Δ 0→200 navs (⚠ warmup-dominated, not a leak #1462) (KB) | 396 | **247** | 303 |

## Active links (100) — per-nav wall-clock (click→DOM settle) — `active-links`

Per-nav wall recompute across 100 links (steady-state toggle). **real-router WINS — wall 0.090 vs sv-router 0.195, mateo-router 0.200 (~2.2×)** (its shared cached active-source, one `router.subscribe`) over per-link active recompute. A clear per-nav win — part of real-router's cross-cohort active-links lead (React / Angular win too). *(Sub-ms — the win is robust; absolute ms session/load-dependent.)*

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| nav / wall (click→settle) (ms) | **0.090** | 0.195 | 0.200 |
| · nav / task (ΔTaskDuration) (ms) | **0.096** | 0.206 | 0.214 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | **0.082** | 0.140 | 0.182 |
| · blink diag (gap=0, #1452) (ms) | 0.026 | 0.028 | **0.023** |

## Back / forward — per-nav wall-clock (popstate → DOM settle) — `back-forward`

Browser **back/forward** (popstate) steady-state. **Near 3-way tie (~5% spread) after #1353** — sv-router ~0.203, real-router ~0.207, mateo-router ~0.213. The skip-no-op-`replaceState` fix cut real-router's back/forward from a **~53% loss to a dead heat** with the two minimal Svelte routers. Allocation near-parity (real-router ~13 KB; sv-router ~12 leanest; mateo 17). *(n=50.)*

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| nav / wall (back/fwd→settle) (ms) | 0.207 | **0.203** | 0.213 |
| · nav / task (ΔTaskDuration) (ms) | 0.116 | **0.095** | 0.117 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | 0.054 | **0.028** | 0.037 |
| · blink diag (gap=0; rr 2×/nav honest) (ms) | 0.087 | 0.089 | **0.085** |
| alloc / nav (GC pressure) (KB) | 12.61 | **11.89** | 17.20 |

## Link build — mount 1000 links (href construction, wall-clock) — `link-build`

CPU to mount 1000 links, each building its href. **sv-router leanest (3.20 ms ≈ the bare-`<a>` floor) — plain `<a href>` intercepted by a global click handler, no per-link component**; mateo-router 7.20; **real-router heaviest (12.10 ms)** — after #1101's shared active-name selector removed the per-link subscription, the residual is `@real-router/svelte`'s `<Link>` running `buildPath` per link + per-component instantiation. sv-router avoids both with a literal `<a href>`: the Svelte loss is **structural** (component `<Link>` vs plain anchor), not slow engineering — `buildPath` is inherent and React/Solid/Angular rr pay it and *win* their link-build.

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| mount 1000 links (wall → DOM-commit, pre-paint; #1462) (ms) | 12.10 | **3.20** | 7.20 |

## Nested switch (reuse) — per-nav wall-clock (click→DOM settle) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **sv-router leanest (wall 0.095); real-router second (0.135)** on this sub-ms per-nav-render metric. **mateo-router is N/A** — its `<Router>` renders through `{#key result.path.original}` (the full evaluated URL), so a two-level app REMOUNTS the layout + inner router on every switch (full-remount, not the ancestor-reuse this scenario measures); the reuse contract is inexpressible in this router, so no ranked number is published for it (#1456). *(Sub-ms — session/load-dependent.)*

| metric | real-router | sv-router | mateo-router |
|---|---|---|---|
| nav / wall (click→settle) (ms) | 0.135 | **0.095** | — |
| · nav / task (ΔTaskDuration) (ms) | 0.141 | **0.119** | — |
| · ⚠ script (V8, microtask-blind #1451) (ms) | 0.125 | **0.044** | — |
| · blink diag (gap=0, #1452) (ms) ⚖ | 0.024 | 0.024 | — |

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
| cold-start script (ms) | 2.02 | 5.16 (+3.1) | 3.58 (+1.6) | 4.00 (+2.0) |
| cold-start heap retained (MB) | 1.72 | 2.20 (+0.5) | 1.85 (+0.1) | 1.89 (+0.2) |
| link-build mount (ms) | 3.00 | 12.10 (+9.1) | 3.20 (+0.2) | 7.20 (+4.2) |

**Reading:** over bare Svelte, sv-router's plain `<a href>` link-build sits ~at the floor; real-router adds the most on boot and on links (its `<Link>` reverse-matcher). real-router's separation is the matcher-scale win (wide @1000) + the full capability set, not the simple hot path. (Per-nav is ranked router-vs-router in the tables above.)

## What this does NOT measure / caveats

- **No cross-framework ranking** — each column is the same framework (Svelte); the delta is router work. (Do NOT compare to the React/Vue/Solid cohorts.)
- **No `@tanstack/svelte-router`** — it does not exist (npm 404); the popular `svelte-spa-router` (hash + regex) and `svelte-routing` are minimalist-class (excluded like `wouter`), SvelteKit is framework-bundled. The cohort is real-router + the two community full routers that exist.
- **Deep-nesting rises O(depth) (task 3.23 ms @90) — cause not yet decomposed for Svelte.** #1094's Solid research showed the analogous rise was ~60% a *Solid-specific* benchmark-app artifact (O(d²) lazy props) + adapter bugs (cache-key + subtree remount), reduced to ~1.1 ms @90 in prototype. The Svelte deep app was not analyzed the same way — treat the curve as directional pending a #1094-style decomposition. The core matcher is flat-capable.
- **`@real-router/svelte` `<Link>` is heavy** — link-build 12.1 ms for 1000 links (vs bare-`<a>` 3.0, sv-router 3.3). #1101's shared active-name selector already removed the per-link subscription (14.6 → 12.0); the residual is `buildPath` per link (inherent) + per-`<Link>`-component instantiation. sv-router avoids both via a literal `<a href>` + a global click handler — a **structural** difference (component `<Link>` with a reverse-matcher vs a non-component `<a>`), not an addressable speed gap; read this row as structural (an N/A-class comparison), not a plain loss.
- **`mateo-router` renders depth 90** — no internal error boundary at deep nesting (contrast the Solid cohort's `@tanstack/solid-router`, which errored past ~30).
- **`mateo-router` `nested-switch` is N/A** — its `<Router>` renders through `{#key result.path.original}` (the full evaluated URL, per its `route.svelte.d.ts`), so a two-level app REMOUNTS the outer layout + inner router on every `/sec/a↔/sec/b` switch (full-remount, not ancestor-reuse). The scenario's reuse contract is inexpressible in this router, so the cell is SKIPPED (`run-all` `KNOWN_NA`) rather than published as a ranked number for less work (#1456). The other 13 nested cells are verified two-level.
- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.
- `wide`/`deep` are scaling sweeps — the per-size *curve* matters (wide separates real-router flat-trie from sv-router O(N); deep separates the adapters' composition cost).
- **Per-nav `nav-latency` `script` medians are near timer granularity** (`_baseline` and sv-router per-nav script is sub-0.3 ms → inflated *relative* variance) — a diagnostic row; at n=50 the headline **wall**/**task** and the sweeps (wide/deep, table-heap, cold-start heap, link-build) rest on stable, larger-magnitude signals (RME < ~3%).

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs svelte`.

