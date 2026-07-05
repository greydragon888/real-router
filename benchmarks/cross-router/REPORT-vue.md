# Cross-Router Performance — Vue cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/vue` · `vue-router@4` (the official Vue 3 router) · `@tanstack/vue-router` — three full routers that own a navigation pipeline (route resolution, guards, nested layouts, reactive/immutable state). `vue-router@5` is excluded because it pulls `pinia`/`@pinia/colada` as peer deps, which would inflate non-router metrics; v4 is the self-contained Vue 3 standard.

**Scope — three full routers, like-for-like.** Unlike the Preact cohort, no minimalist exclusion is needed: all three own a real navigation pipeline. vue-router 4 is the official Vue 3 router; tanstack is the type-first challenger. The honest split that emerges along **two axes (don't conflate them)**: on **scale** — route tables/depth, i.e. the matcher + memory (wide-config @1000, table-heap @10k, deep) — **real-router wins** (O(1) trie + lean core); on **per-nav render** — small tables, heavy re-render (param-nav, active-links, nested-switch) — **vue-router's native reactivity is leaner** (the Vue-adapter soft spot, *not* the core). A heavy *route table* ≠ a heavy *render*. **tanstack is heaviest on memory and degrades at depth**.

**Run:** runs 30 · warmup 5 · throttle off · 2026-07-05T02:29:30.504Z · Apple M3 Pro · numbers are **median** (winner per row **bold**).

⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the **stable signals** — CPU (`script`), heap, FCP. Felt latency was dropped (render/frame-bound, not router-attributable). `nav-churn` throughput is frame-capped — read CPU/nav + heap. **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ — notably `history.pushState`'s `updateForSameDocumentNavigation` (~130 µs/nav, CDP-traced) and paint — which is ~identical across routers, so `script` *ratios* overstate the *total* per-nav gap (e.g. a ~4× `script` ratio is ≈ parity in total — Vue cohort all ~0.32 ms, CDP-traced + harness-reported).

## Cold start — `cold-start`

App init + parse/exec to first route painted. vue-router is the lightest to boot, real-router middle, tanstack heaviest.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| main-thread script (ms) | 5.50 | **4.13** | 6.48 |
| JS heap (MB) | 3.08 | **2.79** | 3.34 |
| FCP (ms) | 24.00 | **20.00** | 24.00 |

## Navigation — per-nav total main-thread (script + history) — `nav-latency`

Per-navigation main-thread script, **steady-state** (N navs ÷ N, each fully completing before the next — so async routers' deferred work *is* counted; this is a fair total, not a sync-vs-async artifact). **vue-router is exceptionally lean (~0.043 ms/nav — the lightest router in any cohort here):** Vue's fine-grained reactivity turns a route change into a minimal reactive-ref update + `<RouterView>` swap. real-router (~0.18) and tanstack (~0.17) are ~4× heavier **in `script`** — but that ratio is **`ScriptDuration` (V8-only)** and excludes Blink C++. A CDP **trace** shows the dominant per-nav cost is Blink's `updateForSameDocumentNavigation` (the `history.pushState` work), which **vue-router triggers 2×/nav** (`replaceState`+`pushState`) vs real-router **1×**. Counting it, **all three are at PARITY — ~0.32 ms/nav (within ~3%): real-router 0.317 ≈ vue-router 0.327 ≈ tanstack 0.314** (15 runs). vue-router's ~4× lean script (0.037) is *exactly* offset by its 2× Blink history (0.30 vs real-router's 0.18); real-router is balanced (script 0.15 + Blink 0.18). So '4× lighter vue-router nav' is a `ScriptDuration` artifact — fairly counted, the three are equal. The harness now reports total + script + Blink (this is reproducible, not hand-recorded). (Blink is CDP-traced — per-call absolute noisy ~0.06–0.13 ms, but the count 2× vs 1× is exact from each router's source.) real-router's small residual script edge is navigate render/emit — **not** the adapter (a lean native-`computed` Link does not close it), **not** history, **not** the core (pure-Node 0.79 µs, lighter than vue-router). real-router's Vue nav is fast absolutely — under one frame, below its own React number (~0.38).

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.587 | **0.508** | 0.513 |
| · script (V8 only) (ms) | 0.285 | **0.056** | 0.219 |
| · Blink history (pushState) (ms) | 0.306 | 0.455 | **0.294** |
| alloc / nav (GC pressure) (KB) | — | — | — |

## Param navigation — per-nav total (script + history) — `param-nav`

Per-nav total changing :id (steady-state sweep). **vue-router lightest (0.38), tanstack 0.43, real-router 0.48 (~1.26×)** — the script-only ~5× shrinks to ~1.3× in total (vue-router's 2× Blink).

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.471 | 0.491 | **0.466** |
| · script (V8 only) (ms) | 0.157 | **0.041** | 0.159 |
| · Blink history (pushState) (ms) | 0.309 | 0.451 | **0.302** |
| alloc / nav (GC pressure) (KB) | — | — | — |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table — **the matcher crossover.** vue-router is lightest at small N (lean Vue floor: ~0.16 total @10/@100) but **degrades @1000 to 0.434** (O(N) matcher); **real-router stays flat (~0.24) and WINS @1000** — 0.240 < vue-router 0.434, tanstack 0.293 — on **total**, not just script (0.177 vs 0.350). The trie's structural win at scale survives the honest metric.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total @10 (ms) | 0.217 | **0.145** | 0.292 |
| ≈ total @100 (ms) | 0.209 | **0.150** | 0.290 |
| ≈ total @1000 (ms) | **0.218** | 0.394 | 0.277 |
| · script (matcher) @10 (ms) | 0.160 | **0.066** | 0.235 |
| · script (matcher) @100 (ms) | 0.154 | **0.070** | 0.231 |
| · script (matcher) @1000 (ms) | **0.161** | 0.317 | 0.223 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **real-router is the lightest at 10k (~0.64 KB/route — the #1009/#1010-optimized trie)**, beating vue-router (~1.19 KB/route) and tanstack (~0.90). At scale real-router wins both CPU (wide) and memory.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| heap @1 (floor) (MB) | 2.15 | **1.94** | 2.36 |
| heap @1k (MB) | **2.98** | 3.34 | 3.34 |
| heap @10k (MB) | **8.56** | 13.84 | 11.31 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain; **total** + **script** (matcher). **real-router and vue-router stay flat** (real-router ~0.30 total; vue-router ~0.18 — its leaner per-nav floor); **tanstack rises O(depth)** (0.38 → 1.17, ~3× by @90). Both full pipelines stay flat — matcher/composition doesn't degrade; tanstack's deep-nav cost grows. Real apps rarely nest past ~10.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total @3 (ms) | 0.231 | **0.181** | 0.346 |
| ≈ total @30 (ms) | 0.288 | **0.158** | 0.658 |
| ≈ total @60 (ms) | 0.253 | **0.168** | 0.825 |
| ≈ total @90 (ms) | 0.264 | **0.162** | 1.05 |
| · script (matcher) @3 (ms) | 0.173 | **0.102** | 0.289 |
| · script (matcher) @30 (ms) | 0.231 | **0.076** | 0.600 |
| · script (matcher) @60 (ms) | 0.195 | **0.087** | 0.766 |
| · script (matcher) @90 (ms) | 0.202 | **0.082** | 0.983 |

## Search-param scaling — query-param count (sweep, reads all values) — `search-param-scaling`

Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`, the realistic high-count vector), reading every value. **vue-router lightest and FLAT (~0.19 @50)** — `route.query` is a plain reactive object, cheap to read at any count. **real-router is also flat (~0.32 @50, slope ~0)** — eager immutable params. **tanstack rises steeply — 1.10 ms @50 (slope ~15 µs/param)**, its O(count) search parse/validate/structural-share pipeline. So on query params vue-router's plain-object query edges real-router's flat curve, and tanstack degrades at scale. **`alloc/nav`** (GC-pressure axis): real-router's eager params reference URL-parsed strings, so per-nav allocation stays **flat** with query count — the memory counterpart to its flat `script` curve (react-cohort probe: real-router the leanest allocator; parse/validate pipelines allocate O(count) garbage).

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total @1 (ms) | 0.228 | **0.146** | 0.329 |
| ≈ total @10 (ms) | 0.237 | **0.127** | 0.444 |
| ≈ total @50 (ms) | 0.268 | **0.153** | 0.989 |
| · script (query-parse) @1 (ms) | 0.165 | **0.067** | 0.269 |
| · script (query-parse) @10 (ms) | 0.178 | **0.046** | 0.388 |
| · script (query-parse) @50 (ms) | 0.204 | **0.062** | 0.928 |
| alloc / nav @50↔@1 (GC pressure) (KB) | — | — | — |

## Nav churn (stress) — `nav-churn`

200-nav stress; per-nav total (script + Blink) + heap. **vue-router lightest CPU/nav (0.50 total)**, tanstack 0.53, real-router 0.63; **real-router retains the least heap (510 ≈ vue-router 519; tanstack ~2× at 1079)**. navsPerSec frame-capped — read CPU/nav + heap.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total / nav (ms) | 0.628 | **0.502** | 0.532 |
| · script / nav (V8) (ms) | 0.327 | **0.058** | 0.244 |
| · Blink / nav (pushState) (ms) | 0.305 | 0.444 | **0.289** |
| heap retained (200 navs) (KB) | **510** | 519 | 1079 |
| throughput (frame-capped) (/s) | 121 | **121** | 121 |

## Active links (100) — per-nav total (script + history) — `active-links`

Per-nav total recompute across 100 links (steady-state toggle). **All three near-parity — real-router / vue-router / tanstack cluster ~0.37–0.49 ms**, and the ranking is within run-to-run noise (real-router led one run at 0.37, tanstack another at 0.39 — a ~0.05 ms sub-metric spread). No stable winner here: unlike React/Svelte/Angular (where competitors pay heavier per-link active machinery), Vue's fine-grained reactivity is already lean enough that real-router's shared active-source doesn't separate from it.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | **0.371** | 0.376 | 0.425 |
| · script (V8 only) (ms) | 0.130 | **0.032** | 0.207 |
| · Blink history (pushState) (ms) | 0.244 | 0.342 | **0.215** |

## Link build — mount 1000 links (href construction) — `link-build`

CPU to mount 1000 links, each building its href (real-router `buildPath` · vue-router `resolve` · tanstack build). **All three tiny (~0.19–0.26 ms) — tanstack (0.19) and vue-router (0.20) leanest; real-router 3rd (~0.26 ≈ the bare-Vue floor 0.27)**: Vue's link-build isn't subscription-bound, so real-router's shared active-name selector (which wins React's link-build) adds nothing to move over an already-floor number. Sub-0.3 ms for all — not a link-heavy differentiator in this cohort.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| script (1000 links) (ms) | 0.260 | 0.207 | **0.201** |

## Nested switch (reuse) — per-nav total (script + history) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **vue-router lightest (0.23), tanstack 0.34, real-router 0.45 (~1.9×)**.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.470 | 0.485 | **0.442** |
| · script (V8 only) (ms) | 0.163 | **0.032** | 0.148 |
| · Blink history (pushState) (ms) | 0.302 | 0.454 | **0.292** |

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
| cold-start script (ms) | 2.39 | 5.50 (+3.1) | 4.13 (+1.7) | 6.48 (+4.1) |
| cold-start heap (MB) | 2.53 | 3.08 (+0.5) | 2.79 (+0.3) | 3.34 (+0.8) |
| nav script (ms) | 0.208 | 0.285 (+0.1) | 0.056 (−0.2) | 0.219 (+0.0) |
| link-build script (ms) | 0.269 | 0.260 (−0.0) | 0.207 (−0.1) | 0.201 (−0.1) |

**Reading:** over bare Vue, vue-router adds the least on startup (+2.1 ms) and its reactivity-driven nav is so targeted it can beat the naive full-re-render baseline; real-router is middle (+3.1 cold-start), tanstack heaviest (+4.3). The marginal costs are small — at realistic scale all three are fast. The separation appears **at scale** (wide / table-heap / deep), where real-router's trie wins CPU *and* memory and tanstack degrades.

## What this does NOT measure / caveats

- **No cross-framework ranking** — each column is the same framework (Vue); the delta is router work. (Do NOT compare to the React/Preact cohorts.)
- **vue-router 4, not 5** — v5 pulls `pinia`/`@pinia/colada` as peers (would inflate non-router metrics); v4 is the self-contained Vue 3 standard.
- **`nav-churn` navsPerSec is frame-capped** — CPU/nav + retained heap differentiate.
- `real-router` includes `browser-plugin` (real History API) — part of its cold-start by contract.
- `wide`/`deep` are scaling sweeps — the per-size *curve* matters more than any single point (real-router flat; vue-router degrades at wide @1000; tanstack at deep).

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs vue`.

