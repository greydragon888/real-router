# Cross-Router Performance — Vue cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/vue` · `vue-router@4` (the official Vue 3 router) · `@tanstack/vue-router` — three full routers that own a navigation pipeline (route resolution, guards, nested layouts, reactive/immutable state). `vue-router@5` is excluded because it pulls `pinia`/`@pinia/colada` as peer deps, which would inflate non-router metrics; v4 is the self-contained Vue 3 standard.

**Scope — three full routers, like-for-like.** Unlike the Preact cohort, no minimalist exclusion is needed: all three own a real navigation pipeline. vue-router 4 is the official Vue 3 router; tanstack is the type-first challenger. The honest split that emerges along **two axes (don't conflate them)**: on **scale** — route tables/depth, i.e. the matcher + memory (wide-config @1000, table-heap @10k, deep) — **real-router wins** (O(1) trie + lean core); on **per-nav render** — small tables, heavy re-render (param-nav, active-links, nested-switch) — **vue-router's native reactivity is leaner** (the Vue-adapter soft spot, *not* the core). A heavy *route table* ≠ a heavy *render*. **tanstack is heaviest on memory and degrades at depth**.

**Run:** runs 8 · warmup 5 · throttle off · 2026-06-28T06:18:03.809Z · Apple M3 Pro · numbers are **median** (winner per row **bold**).

⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the **stable signals** — CPU (`script`), heap, FCP. Felt latency was dropped (render/frame-bound, not router-attributable). `nav-churn` throughput is frame-capped — read CPU/nav + heap. **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ — notably `history.pushState`'s `updateForSameDocumentNavigation` (~130 µs/nav, CDP-traced) and paint — which is ~identical across routers, so `script` *ratios* overstate the *total* per-nav gap (e.g. a ~4× `script` ratio is ≈ parity in total — Vue cohort all ~0.32 ms, CDP-traced + harness-reported).

> **Two distinct axes — don't conflate them.**
> **(1) Scale** — how the router's matcher + memory hold up as route tables grow (`wide-config`, `deep-config`, `table-heap`): **real-router wins** — O(1) segment trie + lean core (0.22 ms @1000 routes vs vue-router 0.37; **0.64 vs 1.19 KB/route** @10k; flat at depth). This is the classic "big/heavy routes → real-router leads", and it holds in Vue too.
> **(2) Per-nav render** — *small* route tables but heavy re-render per navigation (`param-nav`, `active-links`, `nested-switch`): the cost is Vue's VDOM re-render + the **adapter**, **not** the matcher — and here **vue-router's native reactivity is leaner** (real-router ~1.1–1.9×, the known Vue-adapter soft spot, not the core).
> A heavy *route table* ≠ a heavy *render*: real-router leads the former, vue-router the latter. (Note `active-links` mounts 100 routes, but each nav still matches **one** in O(1) — its cost is the **100 `<Link>` re-renders**, i.e. the render axis, not the matcher; cf. `wide-config @1000` where the matcher *is* stressed and real-router wins.)

## Cold start — `cold-start`

App init + parse/exec to first route painted. vue-router is the lightest to boot, real-router middle, tanstack heaviest.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| main-thread script (ms) | 5.63 | **4.64** | 6.86 |
| JS heap (MB) | 3.06 | **2.80** | 3.34 |
| FCP (ms) | 24.00 | **20.00** | 24.00 |

## Navigation — single client nav (CPU) — `nav-latency`

Per-navigation cost shown as **total main-thread = `script` (V8) + Blink history**. **`ScriptDuration` (V8-only)** alone has vue-router exceptionally lean (~0.043 ms) vs real-router / tanstack ~4× — **but it excludes Blink C++.** A CDP **trace** shows the *dominant* per-nav cost is Blink's `updateForSameDocumentNavigation` (the `history.pushState` work), which **vue-router triggers 2×/nav** (`replaceState` + `pushState`) vs real-router **1×**. Counting it, **all three are at PARITY — real-router 0.317 ≈ vue-router 0.327 ≈ tanstack 0.314 (~0.32 ms each, within ~3%, 15 runs)**: vue-router's ~4× lean script (0.037) is *exactly* offset by its 2× Blink history (0.30 vs real-router's 0.18). So the famous "~4× lean vue-router nav" is largely `ScriptDuration` hiding that 2× history cost. (Blink per-nav is CDP-traced — the per-call absolute is noisy ~0.06–0.13 ms across runs, but the call *count* — vue-router 2×, real-router 1× — is exact from each router's source.) real-router's small residual script edge is the navigate pipeline render/emit — **not** the adapter (a lean native-`computed` Link does **not** close it), **not** history, **not** the core (pure-Node 0.79 µs, lighter than vue-router); its Vue nav is under one frame, below its own React number (~0.38).

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| **≈ total main-thread (ms)** | **0.317** | 0.327 | 0.314 |
| · script — V8 only (`ScriptDuration`) (ms) | 0.148 | **0.037** | 0.146 |
| · Blink history — `pushState` (ms) | 0.175 | 0.296 (**2×**) | 0.171 |

_15 runs; RME ~9–18% (Blink the noisier half). `total` + `script` + `Blink` are now produced by the harness — reproducible, not hand-recorded._

## Param navigation (CPU) — `param-nav`

Per-navigation **total** changing :id (steady-state sweep). **vue-router lightest (0.38), tanstack 0.43, real-router 0.48** (~1.26× vue-router). Script-only would show vue-router ~5× lighter (0.037 vs 0.19); total shrinks it to ~1.26× — vue-router's lean reactivity is offset by its 2× Blink (0.35). (10 runs.)

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.481 | **0.381** | 0.433 |
| · script — V8 only (ms) | 0.188 | **0.037** | 0.157 |
| · Blink history — `pushState` (ms) | 0.293 | 0.349 | **0.266** |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table — **the matcher crossover.** vue-router is lightest at small N (lean Vue floor: ~0.16 total @10/@100) but **degrades @1000 to 0.434** (O(N) matcher); **real-router stays flat (~0.24) and WINS @1000** — 0.240 < vue-router 0.434, tanstack 0.293 — on **total**, not just script (0.177 vs 0.350). The trie's structural win at scale survives the honest metric. (10 runs.)

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total @10 (ms) | 0.243 | **0.162** | 0.309 |
| ≈ total @100 (ms) | 0.248 | **0.158** | 0.300 |
| ≈ total @1000 (ms) | **0.240** | 0.434 | 0.293 |
| · script (matcher) @10 (ms) | 0.176 | **0.079** | 0.245 |
| · script (matcher) @100 (ms) | 0.185 | **0.076** | 0.242 |
| · script (matcher) @1000 (ms) | **0.177** | 0.350 | 0.229 |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **real-router is the lightest at 10k (~0.64 KB/route — the #1009/#1010-optimized trie)**, beating vue-router (~1.19 KB/route) and tanstack (~0.90). At scale real-router wins both CPU (wide) and memory.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| heap @1 (floor) (MB) | 2.14 | **1.94** | 2.36 |
| heap @1k (MB) | **2.96** | 3.35 | 3.34 |
| heap @10k (MB) | **8.54** | 13.85 | 11.31 |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain; **total** + **script** (matcher). **real-router and vue-router stay flat** (real-router ~0.30 total; vue-router ~0.18 — its leaner per-nav floor); **tanstack rises O(depth)** (0.38 → 1.17, ~3× by @90). Both full pipelines stay flat — matcher/composition doesn't degrade; tanstack's deep-nav cost grows. Real apps rarely nest past ~10. (10 runs.)

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total @3 (ms) | 0.254 | **0.198** | 0.381 |
| ≈ total @30 (ms) | 0.326 | **0.172** | 0.710 |
| ≈ total @60 (ms) | 0.285 | **0.189** | 0.894 |
| ≈ total @90 (ms) | 0.299 | **0.175** | 1.169 |
| · script (matcher) @3 (ms) | 0.192 | **0.117** | 0.309 |
| · script (matcher) @30 (ms) | 0.255 | **0.090** | 0.642 |
| · script (matcher) @60 (ms) | 0.221 | **0.106** | 0.828 |
| · script (matcher) @90 (ms) | 0.237 | **0.087** | 1.100 |

## Param scaling — path-param count (sweep) — `param-scaling`

Routes with 1 / 10 / 100 path params — **floor-bound, matcher barely stressed.** **vue-router lightest** (~0.13–0.17 total, its lean Vue per-nav floor), real-router ~0.27–0.37, tanstack highest. Param count ~a non-factor for all; the gap is the per-nav floor, **not** param extraction — contrast wide@1000, where the matcher IS stressed and real-router wins. (10 runs.)

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total @1 (ms) | 0.273 | **0.159** | 0.343 |
| ≈ total @10 (ms) | 0.265 | **0.132** | 0.382 |
| ≈ total @100 (ms) | 0.372 | **0.173** | 0.533 |
| · script (matcher) @1 (ms) | 0.205 | **0.071** | 0.275 |
| · script (matcher) @10 (ms) | 0.202 | **0.050** | 0.320 |
| · script (matcher) @100 (ms) | 0.296 | **0.079** | 0.464 |

## Nav churn (stress) — `nav-churn`

200 navigations; per-nav total (script + Blink) + heap. **vue-router lightest CPU/nav (0.54 total)**, tanstack 0.58, real-router 0.67. **real-router retains the least heap (509 KB ≈ vue-router 519; tanstack ~2× at 1071)**. navsPerSec frame-capped. (10 runs.)

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total / nav (ms) | 0.670 | **0.536** | 0.583 |
| · script / nav (V8) (ms) | 0.346 | **0.080** | 0.304 |
| · Blink / nav (`pushState`) (ms) | 0.330 | 0.457 | **0.264** |
| heap retained (200 navs) (KB) | **509** | 519 | 1071 |
| throughput (frame-capped) (/s) | **121** | 121 | 121 |

## Active links (100) — recompute CPU — `active-links`

Per-navigation **total** recompute across 100 links (steady-state toggle). **tanstack lightest (0.36), vue-router 0.41, real-router 0.47** — all three tight (~1.3×). Contrast the React cohort, where real-router's active-links is far ahead (0.79 vs ~1.5–1.6); Vue's three cluster here. (10 runs.)

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.465 | 0.410 | **0.359** |
| · script — V8 only (ms) | 0.153 | **0.056** | 0.167 |
| · Blink history — `pushState` (ms) | 0.297 | 0.346 | **0.175** |

## Link build — mount 1000 links (href construction) — `link-build`

CPU to mount 1000 links, each building its href (real-router `buildPath` · vue-router `resolve` · tanstack build). vue-router leanest; real-router and tanstack close.

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| script (1000 links) (ms) | 0.323 | **0.213** | 0.219 |

## Nested switch (reuse) — CPU — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state toggle) — all three reuse the parent. **vue-router lightest (0.23), tanstack 0.34, real-router 0.45** (~1.9× vue-router). (10 runs.)

| metric | real-router | vue-router | tanstack |
|---|---|---|---|
| ≈ total main-thread (ms) | 0.445 | **0.229** | 0.340 |
| · script — V8 only (ms) | 0.161 | **0.041** | 0.137 |
| · Blink history — `pushState` (ms) | 0.273 | **0.182** | 0.186 |

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
| cold-start script (ms) | 2.56 | 5.63 (+3.1) | 4.64 (+2.1) | 6.86 (+4.3) |
| cold-start heap (MB) | 2.53 | 3.06 (+0.5) | 2.80 (+0.3) | 3.34 (+0.8) |
| nav script (ms) | 0.121 | 0.183 (+0.1) | 0.043 (−0.1) | 0.170 (+0.0) |
| link-build script (ms) | 0.289 | 0.323 (+0.0) | 0.213 (−0.1) | 0.219 (−0.1) |

**Reading:** over bare Vue, vue-router adds the least on startup (+2.1 ms) and its reactivity-driven nav is so targeted it can beat the naive full-re-render baseline; real-router is middle (+3.1 cold-start), tanstack heaviest (+4.3). The marginal costs are small — at realistic scale all three are fast. The separation appears **at scale** (wide / table-heap / deep), where real-router's trie wins CPU *and* memory and tanstack degrades.

## What this does NOT measure / caveats

- **No cross-framework ranking** — each column is the same framework (Vue); the delta is router work. (Do NOT compare to the React/Preact cohorts.)
- **vue-router 4, not 5** — v5 pulls `pinia`/`@pinia/colada` as peers (would inflate non-router metrics); v4 is the self-contained Vue 3 standard.
- **`nav-churn` navsPerSec is frame-capped** — CPU/nav + retained heap differentiate.
- `real-router` includes `browser-plugin` (real History API) — part of its cold-start by contract.
- `wide`/`deep` are scaling sweeps — the per-size *curve* matters more than any single point (real-router flat; vue-router degrades at wide @1000; tanstack at deep).

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs vue`.

