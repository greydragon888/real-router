# Cross-Router Performance — Vue cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/vue` · `vue-router@4` (the official Vue 3 router) · `@tanstack/vue-router` — three full routers that own a navigation pipeline (route resolution, guards, nested layouts, reactive/immutable state). `vue-router@5` is excluded because it pulls `pinia`/`@pinia/colada` as peer deps, which would inflate non-router metrics; v4 is the self-contained Vue 3 standard.

**Scope — three full routers, like-for-like.** Unlike the Preact cohort, no minimalist exclusion is needed: all three own a real navigation pipeline. vue-router 4 is the official Vue 3 router; tanstack is the type-first challenger. The honest split that emerges along **two axes (don't conflate them)**: on **scale** — route tables/depth, i.e. the matcher + memory (wide-config @1000, table-heap @10k, deep) — **real-router wins** (O(1) trie + lean core); on **per-nav render** — small tables, heavy re-render (param-nav, active-links, nested-switch) — **vue-router's native reactivity is leaner** (the Vue-adapter soft spot, *not* the core). A heavy *route table* ≠ a heavy *render*. **tanstack is heaviest on memory and degrades at depth**.

**Run:** runs 50 · warmup 5 · throttle off · 2026-07-09T16:27:17.319Z · Apple M3 Pro · numbers are **median** (winner per row **bold**).

⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the **stable signals** — CPU (`script`), heap, FCP. Felt latency was dropped (render/frame-bound, not router-attributable). `nav-churn` throughput is frame-capped — read CPU/nav + heap. **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ — notably `history.pushState`'s `updateForSameDocumentNavigation` (~130 µs/nav, CDP-traced) and paint — which is ~identical across routers, so `script` *ratios* overstate the *total* per-nav gap (e.g. a ~4× `script` ratio is ≈ parity in total — Vue cohort all ~0.32 ms, CDP-traced + harness-reported).

## Cold start — `cold-start`

App init + parse/exec to first route painted. vue-router is the lightest to boot, real-router middle, tanstack heaviest.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| main-thread script (ms) | 5.51 | **4.06** | 6.33 |
| JS heap (MB) | 3.11 | **2.79** | 3.34 |
| FCP (ms) | 24.00 | **20.00** | 24.00 |

## Navigation — per-nav total main-thread (script + history) — `nav-latency`

Per-navigation main-thread, **steady-state** (N navs ÷ N, each fully completing before the next — async routers' deferred work *is* counted; fair total, not a sync-vs-async artifact). **vue-router is exceptionally lean in `script`:** Vue's fine-grained reactivity turns a route change into a minimal reactive-ref update + `<RouterView>` swap — ~4× lighter script than real-router / tanstack. **But `script` is `ScriptDuration` (V8-only) and excludes Blink C++.** A CDP **trace** shows the dominant per-nav cost is Blink's `updateForSameDocumentNavigation` (the `history.pushState` work), which **vue-router triggers 2×/nav** (`replaceState`+`pushState`) vs real-router **1×**. Counting it, **the total gap collapses** — vue-router's ~4× lean script is largely offset by its 2× Blink history, and the three land **close on total** (real-router balanced: mid script + 1× Blink). So '4× lighter vue-router nav' is a `ScriptDuration` artifact — fairly counted on total the field is tight. *(Sub-ms per-nav — absolutes and exact ranking are session/load-dependent; the load-bearing fact is structural: vue-router's 2× vs real-router's 1× `pushState` count is exact from each router's source — the count, not the noisy per-call ms, is the point.)* real-router's Vue nav is fast absolutely (under one frame); its residual script edge is navigate render/emit — **not** the adapter (a lean native-`computed` Link doesn't close it), **not** history, **not** the core (pure-Node lighter than vue-router).

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.639 | **0.538** | 0.540 |
| · script (V8 only) (ms) | 0.307 | **0.060** | 0.231 |
| · Blink history (pushState) (ms) | 0.331 | 0.478 | **0.311** |
| alloc / nav (GC pressure) (KB) | **0.202** | 0.206 | 2.33 |

## Param navigation — per-nav total (script + history) — `param-nav`

Per-nav total changing :id (steady-state sweep). **The script-only ~5× gap (vue-router's lean reactivity) shrinks to a tight ~1.3× spread on total** — vue-router's 2× Blink `pushState` closes most of it, leaving all three sub-ms and close. *(Sub-ms — exact ranking is session/load-dependent; read the tight spread, not the order.)*

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.513 | 0.524 | **0.477** |
| · script (V8 only) (ms) | 0.180 | **0.048** | 0.165 |
| · Blink history (pushState) (ms) | 0.332 | 0.473 | **0.313** |
| alloc / nav (GC pressure) (KB) | 0.547 | **0.120** | 3.03 |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table — **the matcher crossover.** vue-router is lightest at small N (lean Vue floor: ~0.15 total @10/@100) but **degrades @1000 to 0.398** (O(N) matcher); **real-router stays flat (~0.22) and WINS @1000** — 0.232 < vue-router 0.398, tanstack 0.276 — on **total**, not just script (0.171 vs 0.320). The trie's structural win at scale survives the honest metric.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total @10 (ms) | 0.227 | **0.147** | 0.295 |
| ≈ total @100 (ms) | 0.216 | **0.156** | 0.293 |
| ≈ total @1000 (ms) | **0.231** | 0.410 | 0.277 |
| · script (matcher) @10 (ms) | 0.166 | **0.067** | 0.236 |
| · script (matcher) @100 (ms) | 0.160 | **0.071** | 0.235 |
| · script (matcher) @1000 (ms) | **0.173** | 0.329 | 0.222 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **real-router is the lightest at 10k (~0.64 KB/route — the #1009/#1010-optimized trie)**, beating vue-router (~1.19 KB/route) and tanstack (~0.90). At scale real-router wins both CPU (wide) and memory.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| heap @1 (floor) (MB) | 2.17 | **1.94** | 2.36 |
| heap @1k (MB) | **3.04** | 3.34 | 3.34 |
| heap @10k (MB) | **8.62** | 13.84 | 11.31 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain; **total** + **script** (matcher). **real-router and vue-router stay flat** (real-router ~0.27 total; vue-router ~0.17 — its leaner per-nav floor); **tanstack rises O(depth)** (0.35 → 1.04, ~4× real-router by @90). Both full pipelines stay flat — matcher/composition doesn't degrade; tanstack's deep-nav cost grows. Real apps rarely nest past ~10.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total @3 (ms) | 0.230 | **0.180** | 0.347 |
| ≈ total @30 (ms) | 0.293 | **0.158** | 0.654 |
| ≈ total @60 (ms) | 0.259 | **0.170** | 0.818 |
| ≈ total @90 (ms) | 0.267 | **0.161** | 1.04 |
| · script (matcher) @3 (ms) | 0.174 | **0.100** | 0.289 |
| · script (matcher) @30 (ms) | 0.234 | **0.077** | 0.592 |
| · script (matcher) @60 (ms) | 0.200 | **0.089** | 0.760 |
| · script (matcher) @90 (ms) | 0.207 | **0.079** | 0.984 |

## Search-param scaling — query-param count (sweep, reads all values) — `search-param-scaling`

Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`, the realistic high-count vector), reading every value. **vue-router is lightest and FLAT on CPU** — `route.query` is a plain reactive object, cheap at any count; **real-router is also flat** (eager immutable params, slope ~0). **tanstack rises steeply — ~1 ms @50** (its O(count) search parse/validate/structural-share pipeline). So on CPU vue-router's plain-object query edges real-router's flat curve, and tanstack degrades at scale. *(Flat-vs-rising is the robust story; the sub-ms flat absolutes are session-dependent.)* **`alloc/nav` (GC pressure) flips it in memory:** real-router is the **leanest allocator — it ties/beats even vue-router** (~0.24 vs ~0.26 KB/nav @50, both flat; alloc is memory-class, load-stable) and crushes tanstack (~2.6, **~11×**). So real-router's eager snapshot **wins the memory axis exactly where it narrowly cedes CPU** — its params reference URL-parsed strings (flat), refuting 'eager = more garbage' even against the leanest lazy competitor.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total @1 (ms) | 0.233 | **0.147** | 0.334 |
| ≈ total @10 (ms) | 0.241 | **0.126** | 0.452 |
| ≈ total @50 (ms) | 0.270 | **0.152** | 0.989 |
| · script (query-parse) @1 (ms) | 0.172 | **0.066** | 0.275 |
| · script (query-parse) @10 (ms) | 0.183 | **0.045** | 0.395 |
| · script (query-parse) @50 (ms) | 0.207 | **0.063** | 0.926 |
| alloc / nav @50↔@1 (GC pressure) (KB) | **0.243** | 0.271 | 2.63 |

## Nav churn (stress) — `nav-churn`

200-nav stress; per-nav total (script + Blink) + heap. **vue-router lightest CPU/nav (0.51 total)**, tanstack 0.52, real-router 0.62; **real-router retains the least heap (511 ≈ vue-router 519; tanstack ~2× at 1072)**. navsPerSec frame-capped — read CPU/nav + heap.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total / nav (ms) | 0.665 | **0.530** | 0.558 |
| · script / nav (V8) (ms) | 0.341 | **0.062** | 0.257 |
| · Blink / nav (pushState) (ms) | 0.323 | 0.467 | **0.303** |
| heap retained (200 navs) (KB) | **517** | 519 | 1075 |
| throughput (frame-capped) (/s) | 121 | **121** | 121 |

## Active links (100) — per-nav total (script + history) — `active-links`

Per-nav total recompute across 100 links (steady-state toggle). **All three near-parity — real-router / vue-router / tanstack cluster ~0.37–0.49 ms**, and the ranking is within run-to-run noise (real-router led one run at 0.37, tanstack another at 0.39 — a ~0.05 ms sub-metric spread). No stable winner here: unlike React/Svelte/Angular (where competitors pay heavier per-link active machinery), Vue's fine-grained reactivity is already lean enough that real-router's shared active-source doesn't separate from it.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.478 | 0.502 | **0.396** |
| · script (V8 only) (ms) | 0.134 | **0.026** | 0.156 |
| · Blink history (pushState) (ms) | 0.345 | 0.474 | **0.239** |

## Back / forward — per-nav total, browser history traversal (popstate) — `back-forward`

Browser **back/forward** (popstate) steady-state. **real-router WINS — ~1.38 ms vs vue-router ~1.47, tanstack ~2.7** — a **flip after #1353**: skipping the no-op popstate `replaceState` removed real-router's redundant second history event, turning a ~24% loss into a ~6% win over vue-router's single-popstate. Leaner allocator too (~0.18 < vue-router 0.21; tanstack 2.3). *(n=15.)*

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | **1.38** | 1.47 | 2.72 |
| · script (V8 only) (ms) | 0.158 | **0.101** | 0.232 |
| · Blink history (popstate) (ms) | **1.22** | 1.37 | 2.50 |
| alloc / nav (GC pressure) (KB) | **0.177** | 0.209 | 2.29 |

## Link build — mount 1000 links (href construction) — `link-build`

CPU to mount 1000 links, each building its href (real-router `buildPath` · vue-router `resolve` · tanstack build). **All three tiny (~0.19–0.26 ms) — tanstack (0.19) and vue-router (0.20) leanest; real-router 3rd (~0.26 ≈ the bare-Vue floor 0.27)**: Vue's link-build isn't subscription-bound, so real-router's shared active-name selector (which wins React's link-build) adds nothing to move over an already-floor number. Sub-0.3 ms for all — not a link-heavy differentiator in this cohort.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| script (1000 links) (ms) | 0.257 | 0.190 | **0.184** |

## Nested switch (reuse) — per-nav total (script + history) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **A 3-way near-tie on total (~10% spread)** — tanstack edges it, real-router ~4% behind, vue-router last (its lean script is offset by its 2× Blink `pushState`, same as nav-latency). *(Sub-ms — exact order is session/load-dependent; read the tight spread, not the ranking.)*

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.561 | 0.568 | **0.473** |
| · script (V8 only) (ms) | 0.186 | **0.033** | 0.157 |
| · Blink history (pushState) (ms) | 0.374 | 0.531 | **0.314** |

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
| cold-start script (ms) | 2.37 | 5.51 (+3.1) | 4.06 (+1.7) | 6.33 (+4.0) |
| cold-start heap (MB) | 2.53 | 3.11 (+0.6) | 2.79 (+0.3) | 3.34 (+0.8) |
| link-build script (ms) | 0.271 | 0.257 (−0.0) | 0.190 (−0.1) | 0.184 (−0.1) |

**Reading:** over bare Vue, on startup vue-router adds the least (+1.7 ms), real-router is middle (+3.0), tanstack heaviest (+4.0). The marginal costs are small — at realistic scale all three are fast. The separation appears **at scale** (wide / table-heap / deep), where real-router's trie wins CPU *and* memory and tanstack degrades. (Per-nav is not baseline-relative here — vue-router's targeted reactivity beats the naive full-re-render baseline — so it is read router-vs-router in the tables above.)

## What this does NOT measure / caveats

- **No cross-framework ranking** — each column is the same framework (Vue); the delta is router work. (Do NOT compare to the React/Preact cohorts.)
- **vue-router 4, not 5** — v5 pulls `pinia`/`@pinia/colada` as peers (would inflate non-router metrics); v4 is the self-contained Vue 3 standard.
- **`nav-churn` navsPerSec is frame-capped** — CPU/nav + retained heap differentiate.
- `real-router` includes `browser-plugin` (real History API) — part of its cold-start by contract.
- `wide`/`deep` are scaling sweeps — the per-size *curve* matters more than any single point (real-router flat; vue-router degrades at wide @1000; tanstack at deep).

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs vue`.

