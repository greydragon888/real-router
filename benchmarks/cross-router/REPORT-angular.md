# Cross-Router Performance — Angular cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/angular` · `@angular/router` — Angular 22 zoneless standalone-component apps (`@analogjs/vite-plugin-angular`, AOT). `@angular/router` is Angular's official router — a standalone routing library you configure (`provideRouter`, like vue-router), NOT framework-bundled — and the ONLY serious Angular router (no third-party alternatives), so this is a two-engine cohort by ecosystem reality.

**Scope — the two Angular full routers, like-for-like.** The honest picture: **`@angular/router` is a mature, well-optimized official router that wins most raw metrics** — cold-start (~3× lighter boot), nav-latency, param-nav, wide-config (flat AND a lighter floor — its matcher does not degrade), param-scaling, table-heap memory (3.67 vs 8.72 MB @10k), nav-churn CPU, nested-switch. **real-router wins two:** `active-links` (its shared cached active-source vs per-link `routerLinkActive`) and `link-build` (reverse-matcher vs URL-tree serialization). deep-config is ~a wash (both O(depth)). Unlike React/Vue (trie wins scale + memory) and Svelte (trie wins scale vs an O(N) competitor), **Angular's official matcher is flat AND lean, so real-router's structural trie advantage doesn't separate here** — and real-router pays a heavier boot (upfront trie build) and route-table memory. real-router's genuine edges here are active-links, link-build, validated search (capability), and the cross-framework single routing model.

**Run:** runs 10 · warmup 5 · throttle off · 2026-07-02T09:07:04.627Z · Apple M3 Pro · numbers are **median** (winner per row **bold**).

⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the stable signals — CPU (`script`), heap, FCP. Felt latency was dropped (render/frame-bound). `nav-churn` navsPerSec is frame-capped (read CPU/nav + heap). **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++, so `script` ratios overstate the `total` per-nav gap. Angular 22 (zoneless), built via `@analogjs/vite-plugin-angular` (AOT).

## Cold start — `cold-start`

App init + parse/exec to first route painted. **@angular/router boots far lighter — script 2.27 ms** (heap 3.29) vs real-router 6.97 / 3.51 (~3× the boot script). Bare-Angular floor is 1.86 ms / 2.80 MB, so `@real-router/angular` adds ~5 ms of startup (createRouter builds the segment trie + `router.start()` + `provideRealRouter` + `RouteView` init) where `@angular/router`'s `provideRouter` adds ~0.4 ms. real-router's upfront trie build is cross-cohort-consistent (~4.5–7 ms across solid/svelte/angular) — the price of O(1) matching, paid at boot.

| metric | real-router | angular-router |
|---|---|---|
| main-thread script (ms) | 6.97 | **2.27** |
| JS heap (MB) | 3.51 | **3.29** |
| FCP (ms) | 28.00 | **24.00** |

## Navigation — per-nav total main-thread (script + history) — `nav-latency`

Per-navigation total (script + Blink), steady-state. **@angular/router leanest — 0.342 ms** (script 0.146) vs real-router 0.485 (0.288). (The bare-Angular baseline reads 0.591 — its manual `(click)`→`pushState`→signal path is not actually cheaper than either router here; read the two routers against each other.)

| metric | real-router | angular-router |
|---|---|---|
| ≈ total main-thread (ms) | 0.485 | **0.342** |
| · script (V8 only) (ms) | 0.288 | **0.146** |
| · Blink history (pushState) (ms) | 0.192 | **0.182** |

## Param navigation — per-nav total (script + history) — `param-nav`

Per-nav total changing :id (steady-state). **@angular/router leanest (0.362); real-router 0.446.**

| metric | real-router | angular-router |
|---|---|---|
| ≈ total main-thread (ms) | 0.446 | **0.362** |
| · script (V8 only) (ms) | 0.252 | **0.168** |
| · Blink history (pushState) (ms) | **0.186** | 0.196 |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table. **Both matchers are FLAT** (no O(N) degradation) — but **@angular/router is leaner** (total ~0.33 across @10/@100/@1000) than real-router (~0.49). Unlike the Svelte cohort (where sv-router degraded O(N) and real-router's trie won @1000), `@angular/router`'s route matcher is both flat AND a lighter floor — **real-router's segment trie does not win scale here.** Angular's official router is a well-optimized matcher.

| metric | real-router | angular-router |
|---|---|---|
| ≈ total @10 (ms) | 0.502 | **0.344** |
| ≈ total @100 (ms) | 0.510 | **0.373** |
| ≈ total @1000 (ms) | 0.484 | **0.332** |
| · script (matcher) @10 (ms) | 0.439 | **0.276** |
| · script (matcher) @100 (ms) | 0.447 | **0.285** |
| · script (matcher) @1000 (ms) | 0.421 | **0.254** |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **@angular/router far lighter — 3.67 MB @10k** vs real-router 8.72. real-router's segment-trie route storage is the heavier structure; and unlike the React/Vue cohorts it does NOT buy a matcher-scale win here (@angular/router is also flat @1000) — the trie's space cost without the usual space-for-time payoff in this cohort.

| metric | real-router | angular-router |
|---|---|---|
| heap @1 (floor) (MB) | **2.29** | 2.52 |
| heap @1k (MB) | 3.11 | **2.67** |
| heap @10k (MB) | 8.72 | **3.67** |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain. Both rise O(depth) and are ~equal (real-router script 5.14 ms @90 ≈ @angular/router 5.51). **Directional:** #1094's Solid research showed the analogous rise there was ~60% a Solid-specific bench-app artifact + adapter bugs (the adapter fix is Solid-only, `packages/solid`); the Angular deep cost has not been decomposed the same way. Real apps rarely nest past ~10.

| metric | real-router | angular-router |
|---|---|---|
| ≈ total @3 (ms) | 0.959 | **0.704** |
| ≈ total @30 (ms) | 2.70 | **2.55** |
| ≈ total @60 (ms) | **3.79** | 3.88 |
| ≈ total @90 (ms) | **5.22** | 5.58 |
| · script (matcher) @3 (ms) | 0.894 | **0.637** |
| · script (matcher) @30 (ms) | 2.63 | **2.48** |
| · script (matcher) @60 (ms) | **3.72** | 3.81 |
| · script (matcher) @90 (ms) | **5.14** | 5.51 |

## Param scaling — path-param count (sweep) — `param-scaling`

Routes with 1 / 10 / 100 path params — floor-bound. **@angular/router leaner (0.435 @100) vs real-router 0.64.** Param count ~a non-factor for both.

| metric | real-router | angular-router |
|---|---|---|
| ≈ total @1 (ms) | 0.466 | **0.379** |
| ≈ total @10 (ms) | 0.448 | **0.354** |
| ≈ total @100 (ms) | 0.640 | **0.435** |
| · script (matcher) @1 (ms) | 0.397 | **0.317** |
| · script (matcher) @10 (ms) | 0.388 | **0.293** |
| · script (matcher) @100 (ms) | 0.576 | **0.368** |

## Nav churn (stress) — `nav-churn`

200-nav stress; CPU/nav + retained heap. **@angular/router leaner CPU/nav (0.208 vs real-router 0.512) but retains MORE heap (1035 KB vs 547).** navsPerSec ~121 for both (frame-capped) — read CPU/nav + heap.

| metric | real-router | angular-router |
|---|---|---|
| ≈ total / nav (ms) | 0.765 | **0.433** |
| · script / nav (V8) (ms) | 0.512 | **0.208** |
| · Blink / nav (pushState) (ms) | 0.239 | **0.232** |
| heap retained (200 navs) (KB) | **547** | 1035 |
| throughput (frame-capped) (/s) | 121 | **121** |

## Active links (100) — per-nav total (script + history) — `active-links`

Per-nav total recompute across 100 links (steady-state toggle). **real-router WINS — 0.463** (script 0.235) vs @angular/router 0.929 (0.678, ~2×). real-router's shared cached active-source (one `router.subscribe`) beats `@angular/router`'s per-link `routerLinkActive` router-event subscription. real-router's clearest win in this cohort.

| metric | real-router | angular-router |
|---|---|---|
| ≈ total main-thread (ms) | **0.463** | 0.929 |
| · script (V8 only) (ms) | **0.235** | 0.678 |
| · Blink history (pushState) (ms) | 0.250 | **0.239** |

## Link build — mount 1000 links (href construction) — `link-build`

CPU to mount 1000 links, each building its href. **real-router leaner — 14.3 ms** vs @angular/router 18.05, though both are heavy over the bare-`<a>` floor (5.32). real-router's `RealLink` runs the reverse-matcher (`buildPath`); `@angular/router`'s `routerLink` serializes a URL tree (config-independent) — different mechanisms, both costly. real-router's `<Link>` still carries a per-link active source (the #1099 Svelte pattern applies — a shared-selector fast path could reduce it here too).

| metric | real-router | angular-router |
|---|---|---|
| script (1000 links) (ms) | **14.30** | 18.05 |

## Nested switch (reuse) — per-nav total (script + history) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **@angular/router leaner (0.341); real-router 0.496.**

| metric | real-router | angular-router |
|---|---|---|
| ≈ total main-thread (ms) | 0.496 | **0.341** |
| · script (V8 only) (ms) | 0.249 | **0.142** |
| · Blink history (pushState) (ms) | 0.252 | **0.202** |

## Feature support — capability, NOT a perf race

Both are full routers. `✓` = built-in API, `N/A` = none. `@angular/router` is feature-mature; the one gap vs real-router is schema-validated search.

| capability | real-router | angular-router |
|---|---|---|
| Data on navigation (loader tied to route) | ✓ | ✓ |
| Typed / validated search params (schema) | ✓ | N/A |
| Blocking guard (canDeactivate / unsaved-changes) | ✓ | ✓ |
| Built-in scroll restoration | ✓ | ✓ |

`✓` / `N/A` are API-verified against each router's surface. `N/A` = feature-absence, not a speed loss.

**Reading:** `@angular/router` covers data, guard, and scroll restoration first-class; the single gap is **schema-validated search** (real-router's `searchSchema`). So real-router's capability edge in Angular is narrow (one axis) — the honest differentiators are perf on active-links/link-build + validated search + the cross-framework single routing model, not a broad feature or scale advantage.

- **Data on navigation (loader tied to route)** — rr: `onEnter` + `lifecycle`/`preload` plugin · @angular/router: `resolve` resolvers
- **Typed / validated search params (schema)** — rr: `searchSchema` (zod) · @angular/router: raw `queryParams` (typed via input binding, no schema validation)
- **Blocking guard (canDeactivate / unsaved-changes)** — rr: `canDeactivate` · @angular/router: `CanDeactivate` route guard
- **Built-in scroll restoration** — rr: `<RouterProvider>` scrollRestoration · @angular/router: `withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })`

## Router overhead over bare Angular (`_baseline`)

`_baseline` is the same pages with **no router** — manual `signal` view + `history.pushState`, raw `<a>`. Subtract it and `+Δ` is each router's marginal cost.

| metric | bare Angular | real-router | angular-router |
|---|---|---|---|
| cold-start script (ms) | 1.85 | 6.97 (+5.1) | 2.27 (+0.4) |
| cold-start heap (MB) | 2.80 | 3.51 (+0.7) | 3.29 (+0.5) |
| nav script (ms) | 0.331 | 0.288 (−0.0) | 0.146 (−0.2) |
| link-build script (ms) | 5.32 | 14.30 (+9.0) | 18.05 (+12.7) |

**Reading:** over bare Angular, `@angular/router` adds very little at boot (~0.4 ms) and on the hot path; real-router adds ~5 ms at boot (upfront trie build) and more per-nav. (The baseline's `nav-latency` reads oddly high — its manual click→pushState→signal path — so read the two routers against each other there, not vs baseline.)

## What this does NOT measure / caveats

- **No cross-framework ranking** — both columns are the same framework (Angular); the delta is router work.
- **`@angular/router` is the only serious Angular router** — no third-party standalone alternatives exist (unlike React/Vue/Solid/Svelte), so this is a two-engine cohort by ecosystem reality, not exclusion.
- **Deep-config is directional** — both rise O(depth), not decomposed for Angular. #1094's Solid research found the analogous rise was ~60% a Solid-specific bench-app artifact + adapter bugs (fix is `packages/solid`-only). Real apps rarely nest past ~10.
- **real-router's heavier cold-start (~3× the boot script) is the upfront segment-trie build** (createRouter + start) — cross-cohort-consistent (~4.5–7 ms across solid/svelte/angular), the price of O(1) matching paid at boot; a design trade-off, not a defect.
- **`@real-router/angular` `<Link>` link-build carries a per-link active source** — the same shape #1099 fixed for the Svelte adapter (shared selector); a Svelte-style fast path could reduce it here too (candidate follow-up).
- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.
- `wide`/`deep`/`param-scaling` are scaling sweeps — the per-size *curve* matters (both flat on wide/param; deep both O(depth)).
- **Elevated RME on real-router `nav-latency` `script` (n=10, 18.8%)** — its per-nav script is sub-0.3 ms (near timer granularity → inflated *relative* variance). The nav-latency *total* + the headline findings (cold-start, wide/deep sweeps, table-heap, active-links, link-build) rest on stable, larger-magnitude signals (RME < ~5%).

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs angular`.

