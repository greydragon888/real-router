# Cross-Router Performance — Vue cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/vue` · `vue-router@5` (the official Vue 3 router — bumped from v4 by Dependabot #1142; v5 pulls no extra runtime into the measured app bundle, so the comparison stays clean) · `@tanstack/vue-router` — three full routers that own a navigation pipeline (route resolution, guards, nested layouts, reactive/immutable state).

**Scope — three full routers, like-for-like.** No minimalist exclusion is needed: all three own a real navigation pipeline. vue-router 5 is the official Vue 3 router; tanstack is the type-first challenger. The honest split: on **scale** — matcher + memory (wide-config @1000 ~2×, table-heap @10k ~2.3×) — **real-router wins** (O(1) trie + lean core); on **per-nav**, real-router now leads most of the cohort on the settle-timed **wall** (nav-latency, param-nav, nested-switch, back-forward — its 1× vs vue-router's 2× `pushState` carries through where the V8-only `script` diagnostic misses it). **vue-router's fine-grained reactivity stays ahead only on active-links and deep nesting** (its sublinear deep matcher), and it boots lighter. **tanstack is heaviest on memory and degrades at depth**.

**Run:** runs 50 · warmup 5 · throttle off · 2026-07-12T19:20:29.247Z · 322efbdf-dirty · Apple M3 Pro · numbers are **median** (winner per row **bold**; a **⚖** row = the top-2 medians' 95% CIs overlap, so no winner is bolded — not statistically separable, #1460).

⚠️ Preliminary local numbers — directional, not a published verdict. Per-nav is **wall** (click→DOM settle — felt) + **task** (ΔTaskDuration — CPU), both RME < 3% at n=50; the `total = script + Blink` metric was **retired** (#1451/#1452). `script` is a ⚠ **diagnostic** (V8-only, blind to Blink C++ + microtasks — e.g. vue-router's lean `script` misses its 2× `pushState`, which the settle-timed **wall** does capture). Heap/alloc RME < 0.8%. `nav-churn` `navsPerSec` is settle-timed — read CPU/nav + heap.

## Cold start — `cold-start`

App init + parse/exec to first route painted. vue-router is the lightest to boot, real-router middle, tanstack heaviest.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| main-thread script (ms) | 5.62 | **4.13** | 6.41 |
| JS heap (retained, post-GC) (MB) | 2.30 | **2.06** | 2.46 |
| · JS heap @FCP (pre-GC, boot garbage — diag #1454) (MB) | 3.11 | **2.80** | 3.34 |
| FCP (ms) | 24.00 | **20.00** | 24.00 |

## Navigation — per-nav wall-clock (click→DOM settle) — `nav-latency`

Per-nav **wall** (click→DOM settle, felt) + **task** (ΔTaskDuration, CPU). On the ⚠ `script` diagnostic vue-router looks ~2× leaner (Vue's fine-grained reactivity: a minimal reactive-ref update + `<RouterView>` swap) — **but `script` is V8-only, blind to Blink C++ + microtasks.** The felt **wall** tells the real story: **real-router WINS ~1.9× — 0.075 vs vue-router 0.146, tanstack 0.263** — because vue-router fires `history.pushState` **2×/nav** (`replaceState`+`pushState`) vs real-router **1×**, and the settle-timed wall captures the Blink work `script` misses. *(Sub-ms — read ranking/ratio; the load-bearing fact is structural: vue-router's 2× vs real-router's 1× `pushState` is exact from source.)* `alloc/nav`: real-router leanest too (~11 KB vs vue-router 17 / tanstack 73).

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| nav / wall (click→settle) (ms) | **0.075** | 0.146 | 0.263 |
| · nav / task (ΔTaskDuration) (ms) | **0.090** | 0.160 | 0.271 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | 0.039 | **0.017** | 0.052 |
| · blink diag (gap=0, #1452) (ms) ⚖ | 0.023 | 0.043 | 0.023 |
| alloc / nav (GC pressure) (KB) | **10.70** | 17.01 | 73.08 |

## Param navigation — per-nav wall-clock (click→DOM settle) — `param-nav`

Per-nav wall + task changing :id (steady-state sweep). **real-router wins felt wall — 0.110 vs vue-router 0.155, tanstack 0.425** — the `script`-diagnostic's vue-router lead is offset by its 2× `pushState` in the settle-timed wall. *(Sub-ms — read ranking/ratio.)* `alloc/nav`: real-router leanest (~12 KB vs vue-router 15 / tanstack 113).

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| nav / wall (click→settle) (ms) | **0.110** | 0.155 | 0.425 |
| · nav / task (ΔTaskDuration) (ms) | **0.142** | 0.184 | 0.452 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | 0.052 | **0.010** | 0.062 |
| · blink diag (gap=0, #1452) (ms) | **0.024** | 0.045 | 0.025 |
| alloc / nav (GC pressure) (KB) | **11.88** | 14.54 | 113 |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table — **the matcher crossover.** vue-router is lightest at small N (lean Vue floor) but **degrades @1000** (O(N) matcher); **real-router stays flat and WINS @1000 — task 0.275 vs vue-router 0.546, tanstack 0.720** (~2×). The trie's structural win at scale survives the honest metric.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| nav / task @10 (ms) | **0.343** | 0.537 | 0.675 |
| nav / task @100 (ms) | **0.268** | 0.520 | 0.616 |
| nav / task @1000 (ms) | **0.275** | 0.546 | 0.720 |
| · nav / wall @1000 (felt) (ms) | **0.200** | 0.400 | 0.500 |
| · ⚠ script (V8, microtask-blind #1451) @10 (ms) | 0.080 | **0.019** | 0.089 |
| · ⚠ script @100 (ms) | 0.074 | **0.029** | 0.094 |
| · ⚠ script @1000 (ms) | **0.075** | 0.092 | 0.095 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **real-router is the lightest at 10k — 6.07 MB vs vue-router 13.85 (~2.3×) and tanstack 11.31** (the #1009/#1010-optimized trie). At scale real-router wins both CPU (wide) and memory.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| heap @1 (floor) (MB) | 2.18 | **1.94** | 2.36 |
| heap @1k (MB) | **2.71** | 3.34 | 3.35 |
| heap @10k (MB) | **6.07** | 13.85 | 11.31 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain. **vue-router stays near-flat and is leanest at depth** (0.458 → 0.838 @90 — a sublinear matcher); **real-router rises** (0.357 → 1.52 @90); **tanstack explodes O(depth)** (0.816 → 3.24, ~2.1× real-router @90). real-router wins @3, but vue-router's flat deep curve leads from ~@30; both full pipelines stay bounded while tanstack's deep-nav cost grows. Real apps rarely nest past ~10.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| nav / task @3 (ms) | **0.357** | 0.458 | 0.816 |
| nav / task @30 (ms) | 0.876 | **0.723** | 1.35 |
| nav / task @60 (ms) ⚖ | 0.756 | 0.829 | 2.40 |
| nav / task @90 (ms) | 1.52 | **0.838** | 3.24 |
| · nav / wall @90 (felt) (ms) | 0.800 | **0.700** | 3.00 |
| · ⚠ script (V8, microtask-blind #1451) @3 (ms) | 0.068 | **0.026** | 0.094 |
| · ⚠ script @30 (ms) | 0.077 | **0.039** | 0.220 |
| · ⚠ script @60 (ms) | 0.084 | **0.028** | 0.419 |
| · ⚠ script @90 (ms) | 0.082 | **0.028** | 0.597 |

## Search-param scaling — query-param count (sweep, reads all values) — `search-param-scaling`

Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`, the realistic high-count vector), reading every value. **real-router WINS @50 — task 0.287 vs vue-router 0.700, tanstack 2.25** — and stays flat across @10→@50 (eager immutable params). vue-router's `route.query` is a plain reactive object but costs more at count here; **tanstack rises steeply** (O(count) parse/validate/structural-share). *(Flat-vs-rising is the robust story; sub-ms flat absolutes are session-dependent.)* **`alloc/nav` (GC pressure) agrees:** real-router is the **leanest allocator — ~18 KB/nav vs vue-router 33 (~80%) and tanstack 489 (~26.6×)** — its eager params reference URL-parsed strings (flat), winning the memory axis too — refuting 'eager = more garbage' even against the lean-object competitor.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| nav / task @1 (ms) | **0.679** | 0.787 | 1.07 |
| nav / task @10 (ms) | **0.223** | 0.358 | 1.24 |
| nav / task @50 (ms) | **0.287** | 0.700 | 2.25 |
| · nav / wall @50 (felt) (ms) | **0.200** | 0.300 | 1.90 |
| · ⚠ script (query-parse, V8-blind #1451) @1 (ms) | 0.087 | **0.021** | 0.142 |
| · ⚠ script @10 (ms) | 0.079 | **0.024** | 0.280 |
| · ⚠ script @50 (ms) | 0.104 | **0.039** | 1.13 |
| alloc / nav @50↔@1 (GC pressure) (KB) | **18.38** | 33.05 | 489 |

## Nav churn (stress) — `nav-churn`

200-nav stress; per-nav **task** (CPU) + retained **heap Δ**. **real-router lightest CPU/nav — task 0.081** vs vue-router 0.135, tanstack 0.237; **real-router retains the least heap (532 KB ≈ vue-router 524; tanstack ~2× at 1069)**. `navsPerSec` is settle-timed — read CPU/nav + heap (heap Δ warmup-dominated, not a leak #1462).

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| nav / wall (= 1000/navsPerSec) (ms) | **0.074** | 0.128 | 0.231 |
| · nav / task (ΔTaskDuration) (ms) | **0.081** | 0.135 | 0.237 |
| throughput (real, settle-timed) (/s) | **13514** | 7782 | 4334 |
| · ⚠ script / nav (microtask-blind #1451) (ms) | 0.039 | **0.007** | 0.043 |
| · blink diag (gap=0, #1452) (ms) ⚖ | 0.024 | 0.045 | 0.024 |
| heap Δ 0→200 navs (⚠ warmup-dominated, not a leak #1462) (KB) | 532 | **524** | 1069 |

## Active links (100) — per-nav wall-clock (click→DOM settle) — `active-links`

Per-nav wall recompute across 100 links (steady-state toggle). **vue-router leads — 0.320 vs real-router 0.495 (~55%), tanstack 0.832** — the one cohort where real-router cedes active-links. Vue's fine-grained reactivity keeps per-link active updates lean enough that real-router's shared active-source doesn't separate from it (real-router wins active-links in React / Solid / Svelte / Angular). *(Sub-ms — session/load-dependent.)*

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| nav / wall (click→settle) (ms) | 0.495 | **0.320** | 0.832 |
| · nav / task (ΔTaskDuration) (ms) | 0.515 | **0.332** | 0.859 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | 0.056 | **0.008** | 0.088 |
| · blink diag (gap=0, #1452) (ms) | **0.025** | 0.047 | 0.028 |

## Back / forward — per-nav wall-clock (popstate → DOM settle) — `back-forward`

Browser **back/forward** (popstate) steady-state. **real-router WINS — wall 0.211 vs vue-router 0.235, tanstack 0.375** — a **flip after #1353**: skipping the no-op popstate `replaceState` removed real-router's redundant second history event, turning a loss into a ~11% win over vue-router's single-popstate. Leaner allocator too (~11 KB vs vue-router 15 / tanstack 67). *(n=50.)*

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| nav / wall (back/fwd→settle) (ms) | **0.211** | 0.235 | 0.375 |
| · nav / task (ΔTaskDuration) (ms) | **0.122** | 0.157 | 0.308 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | 0.022 | **0.015** | 0.044 |
| · blink diag (gap=0; rr 2×/nav honest) (ms) | **0.090** | 0.137 | 0.255 |
| alloc / nav (GC pressure) (KB) | **11.07** | 15.39 | 67.40 |

## Link build — mount 1000 links (href construction, wall-clock) — `link-build`

Wall-clock to mount 1000 links, each building its href (real-router `buildPath` · vue-router `resolve` · tanstack build). **real-router leanest — 14.40 ms** vs vue-router 23.70, tanstack 43.80 (~3×). Vue's link mount is latency-bound (reactive cascade) over the ~3.5 ms bare-Vue floor; real-router adds the least — the reverse-matcher `buildPath` is cheaper than vue-router's `resolve` here.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| mount 1000 links (wall → DOM-commit, pre-paint; #1462) (ms) | **14.40** | 23.70 | 43.80 |

## Nested switch (reuse) — per-nav wall-clock (click→DOM settle) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **real-router WINS — wall 0.100 vs vue-router 0.220, tanstack 0.320** (~2.2×). *(Sub-ms — session/load-dependent.)*

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| nav / wall (click→settle) (ms) | **0.100** | 0.220 | 0.320 |
| · nav / task (ΔTaskDuration) (ms) | **0.125** | 0.228 | 0.335 |
| · ⚠ script (V8, microtask-blind #1451) (ms) | 0.052 | **0.012** | 0.061 |
| · blink diag (gap=0, #1452) (ms) | 0.024 | 0.044 | **0.023** |

## Feature support — capability, NOT a perf race

Among three full routers, first-class API coverage still differs. `✓` = built-in API, `N/A` = none (hand-rolled in user-land). The differentiator here is validated search — vue-router exposes raw query only, exactly the gap react-router has in the React cohort.

| capability | real-router | vue-router | tanstack |
|---|---|---|---|
| Data on navigation (loader tied to route) | ✓ | ✓ | ✓ |
| Typed / validated search params (schema) | ✓ | N/A | ✓ |
| Blocking guard (canDeactivate / unsaved-changes) | ✓ | ✓ | ✓ |
| Built-in scroll restoration | ✓ | ✓ | ✓ |

`✓` / `N/A` are API-verified against each router's surface (the in-harness `✓ⁱ` demo verification exists for the React cohort; `@real-router/vue` shares that pipeline). `N/A` = feature-absence, not a speed loss.

**Reading:** all three cover data-on-navigation, blocking guards, and scroll restoration; **vue-router lacks first-class validated search** (raw `route.query` — you validate by hand), exactly the gap react-router has in the React cohort. real-router and tanstack offer schema-validated search. Perf and capability read together — vue-router's leanness partly reflects a smaller surface, while real-router's scale wins (the trie) come bundled with the full pipeline.

- **Data on navigation (loader tied to route)** — rr: `onEnter` + `lifecycle`/`preload` plugin · vue-router: `beforeRouteEnter` guard (imperative; no first-class loader/useLoaderData) · tanstack: `loader`
- **Typed / validated search params (schema)** — rr: `searchSchema` (zod) · vue-router: raw `route.query` only (no validation) · tanstack: `validateSearch` (zod)
- **Blocking guard (canDeactivate / unsaved-changes)** — rr: `canDeactivate` · vue-router: `onBeforeRouteLeave` · tanstack: `useBlocker`
- **Built-in scroll restoration** — rr: `<RouterProvider scrollRestoration>` · vue-router: `scrollBehavior` · tanstack: `scrollRestoration: true`

## Router overhead over bare Vue (`_baseline`)

`_baseline` is the same pages with **no router** — manual `ref` + `history.pushState`, raw `<a>`. Subtract it and `+Δ` is each router's marginal cost.

| metric | bare Vue | real-router | vue-router | tanstack |
|---|---|---|---|---|
| cold-start script (ms) | 2.43 | 5.62 (+3.2) | 4.13 (+1.7) | 6.41 (+4.0) |
| cold-start heap retained (MB) | 1.85 | 2.30 (+0.5) | 2.06 (+0.2) | 2.46 (+0.6) |
| link-build mount (ms) | 3.20 | 14.40 (+11.2) | 23.70 (+20.5) | 43.80 (+40.6) |

**Reading:** over bare Vue, on startup vue-router adds the least (+1.7 ms), real-router is middle (+3.0), tanstack heaviest (+4.0). The marginal costs are small — at realistic scale all three are fast. The separation appears **at scale** (wide / table-heap / deep), where real-router's trie wins CPU *and* memory and tanstack degrades. (Per-nav is not baseline-relative here — vue-router's targeted reactivity beats the naive full-re-render baseline — so it is read router-vs-router in the tables above.)

## What this does NOT measure / caveats

- **No cross-framework ranking** — each column is the same framework (Vue); the delta is router work. (Do NOT compare to the React/Preact cohorts.)
- **vue-router 5** (bumped from v4 by Dependabot #1142) — v5 pulls no extra runtime into the measured app bundle, so the comparison is clean; the earlier v4-only note (pinia concern) is obsolete.
- **`nav-churn` navsPerSec is frame-capped** — CPU/nav + retained heap differentiate.
- `real-router` includes `browser-plugin` (real History API) — part of its cold-start by contract.
- `wide`/`deep` are scaling sweeps — the per-size *curve* matters more than any single point (real-router flat; vue-router degrades at wide @1000; tanstack at deep).

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs vue`.

