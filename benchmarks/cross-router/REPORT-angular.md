# Cross-Router Performance — Angular cohort

> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).

**Cohort:** `@real-router/angular` · `@angular/router` — Angular 22 zoneless standalone-component apps (`@analogjs/vite-plugin-angular`, AOT). `@angular/router` is Angular's official router — a standalone routing library you configure (`provideRouter`, like vue-router), NOT framework-bundled — and the ONLY serious Angular router (no third-party alternatives), so this is a two-engine cohort by ecosystem reality.

**Scope — the two Angular full routers, like-for-like.** The honest picture: **`@angular/router` is a mature, well-optimized official router that wins most raw metrics** — cold-start (~3× lighter boot), nav-latency, param-nav, wide-config (flat AND a lighter floor — its matcher does not degrade), table-heap memory (3.67 vs 8.76 MB @10k), nav-churn CPU, nested-switch. **real-router wins two:** `active-links` (its shared cached active-source vs per-link `routerLinkActive`) and `link-build` (reverse-matcher vs URL-tree serialization). deep-config is ~a wash (both O(depth)). Unlike React/Vue (trie wins scale + memory) and Svelte (trie wins scale vs an O(N) competitor), **Angular's official matcher is flat AND lean, so real-router's structural trie advantage doesn't separate here** — and real-router pays a heavier boot (upfront trie build) and route-table memory. real-router's genuine edges here are active-links, link-build, validated search (capability), and the cross-framework single routing model.

**Run:** runs 50 · warmup 5 · throttle off · 2026-07-09T18:27:48.388Z · Apple M3 Pro · numbers are **median** (winner per row **bold**).

⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the stable signals — CPU (`script`), heap, FCP. Felt latency was dropped (render/frame-bound). `nav-churn` navsPerSec is frame-capped (read CPU/nav + heap). **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++, so `script` ratios overstate the `total` per-nav gap. Angular 22 (zoneless), built via `@analogjs/vite-plugin-angular` (AOT).

## Cold start — `cold-start`

App init + parse/exec to first route painted. **@angular/router boots far lighter — script 2.08 ms** (heap 3.29) vs real-router 6.09 / 3.52 (~3× the boot script). Bare-Angular floor is 1.77 ms / 2.80 MB, so `@real-router/angular` adds ~4.3 ms of startup. **Decomposed (#1106, isolation ladder): the excess is CORE, not the adapter** — ~57% is parse+eval of the full `@real-router/core` bundle, ~28% is `createRouter`+`start()` (a warm re-run showed ~90% of *that* is one-time V8 cold-JIT, not initialization *work* — the trie of a small table is trivial); `provideRealRouter` DI (~0.04 ms) and `RouteView` (~0.64 ms) are cheap. So the boot delta is a **code-size-driven one-time cost** (parse + cold-JIT ≈ 11.5 µs/KB on M3) — the price of shipping the full pipeline; competitors' lightness ∝ their smaller / tree-shaken code (`@angular/router`'s `provideRouter` adds ~0.4 ms). Cross-cohort-consistent (~4.5–7 ms across solid/svelte/angular). #1106 tracks it (post-1.0 RFC-candidate; desktop ROI low, SSR/SSG amortizes boot).

| metric | real-router | angular-router |
|---|---|---|
| main-thread script (ms) | 6.20 | **2.07** |
| JS heap (MB) | 3.54 | **3.29** |
| FCP (ms) | 26.00 | **24.00** |

## Navigation — per-nav total main-thread (script + history) — `nav-latency`

Per-navigation total (script + Blink), steady-state. **@angular/router leanest** — real-router trails (its eager transition pipeline vs @angular/router's lean nav). (The bare-Angular baseline's manual `(click)`→`pushState`→signal path is not cheaper than either router; read the two routers against each other. *Sub-ms — session/load-dependent; per-nav `script` is also timer-granular here, see caveats.*)

| metric | real-router | angular-router |
|---|---|---|
| ≈ total main-thread (ms) | 0.885 | **0.542** |
| · script (V8 only) (ms) | 0.592 | **0.245** |
| · Blink history (pushState) (ms) | **0.296** | 0.299 |
| alloc / nav (GC pressure) (KB) | **0.186** | 0.424 |

## Param navigation — per-nav total (script + history) — `param-nav`

Per-nav total changing :id (steady-state). **@angular/router leanest; real-router second** — @angular/router's lean per-nav vs real-router's eager pipeline. *(Sub-ms — session/load-dependent.)*

| metric | real-router | angular-router |
|---|---|---|
| ≈ total main-thread (ms) | 0.634 | **0.504** |
| · script (V8 only) (ms) | 0.337 | **0.202** |
| · Blink history (pushState) (ms) | **0.298** | 0.303 |
| alloc / nav (GC pressure) (KB) | 0.615 | **0.376** |

## Wide config — matcher breadth (sweep) — `wide-config`

Navigate into a flat 1000-route table. **Both matchers are FLAT** (no O(N) degradation) — but **@angular/router is leaner** (total ~0.29 across @10/@100/@1000) than real-router (~0.42). Unlike the Svelte cohort (where sv-router degraded O(N) and real-router's trie won @1000), `@angular/router`'s route matcher is both flat AND a lighter floor — **real-router's segment trie does not win scale here.** Angular's official router is a well-optimized matcher.

| metric | real-router | angular-router |
|---|---|---|
| ≈ total @10 (ms) | 0.431 | **0.287** |
| ≈ total @100 (ms) | 0.414 | **0.304** |
| ≈ total @1000 (ms) | 0.435 | **0.275** |
| · script (matcher) @10 (ms) | 0.376 | **0.225** |
| · script (matcher) @100 (ms) | 0.361 | **0.248** |
| · script (matcher) @1000 (ms) | 0.380 | **0.213** |

## Route-table memory — heap to hold N routes (sweep) — `table-heap`

Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **@angular/router far lighter — 3.67 MB @10k** vs real-router 8.76. real-router's segment-trie route storage is the heavier structure; and unlike the React/Vue cohorts it does NOT buy a matcher-scale win here (@angular/router is also flat @1000) — the trie's space cost without the usual space-for-time payoff in this cohort.

| metric | real-router | angular-router |
|---|---|---|
| heap @1 (floor) (MB) | **2.31** | 2.52 |
| heap @1k (MB) | 3.18 | **2.67** |
| heap @10k (MB) | 8.78 | **3.67** |

## Deep config — nesting depth (sweep) — `deep-config`

Navigate into a 90-level nested chain. Both rise O(depth); real-router edges it at the deep end (script 4.62 ms @90 vs @angular/router 5.22). **Directional:** #1094's Solid research showed the analogous rise there was ~60% a Solid-specific bench-app artifact + adapter bugs (the adapter fix is Solid-only, `packages/solid`); the Angular deep cost has not been decomposed the same way. Real apps rarely nest past ~10.

| metric | real-router | angular-router |
|---|---|---|
| ≈ total @3 (ms) | 0.848 | **0.664** |
| ≈ total @30 (ms) | **2.44** | 2.52 |
| ≈ total @60 (ms) | **3.44** | 3.72 |
| ≈ total @90 (ms) | **4.70** | 5.33 |
| · script (matcher) @3 (ms) | 0.791 | **0.604** |
| · script (matcher) @30 (ms) | **2.38** | 2.46 |
| · script (matcher) @60 (ms) | **3.38** | 3.66 |
| · script (matcher) @90 (ms) | **4.64** | 5.26 |

## Search-param scaling — query-param count (sweep, reads all values) — `search-param-scaling`

Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`, the realistic high-count vector), reading every value. **real-router edges @50 (0.496 vs 0.516)** — both stay near-flat (real-router eager params; @angular/router reads `snapshot.queryParams`, a plain object). Unlike the reactive-store cohorts (Solid `useSearchParams`, Svelte `route.search`) or tanstack (whose search pipeline explodes ~15–22 µs/param), **neither Angular router degrades on query count** — real-router's flat eager curve holds the realistic high-count end. **`alloc/nav`** (GC-pressure axis): real-router's eager params reference URL-parsed strings, so per-nav allocation stays **flat** with query count — the memory counterpart to its flat `script` curve (react-cohort probe: real-router the leanest allocator; parse/validate pipelines allocate O(count) garbage).

| metric | real-router | angular-router |
|---|---|---|
| ≈ total @1 (ms) | **0.441** | 0.460 |
| ≈ total @10 (ms) | **0.414** | 0.442 |
| ≈ total @50 (ms) | **0.488** | 0.513 |
| · script (query-parse) @1 (ms) | **0.381** | 0.404 |
| · script (query-parse) @10 (ms) | **0.363** | 0.387 |
| · script (query-parse) @50 (ms) | **0.433** | 0.457 |
| alloc / nav @50↔@1 (GC pressure) (KB) | **0.241** | 0.760 |

## Nav churn (stress) — `nav-churn`

200-nav stress; CPU/nav + retained heap. **@angular/router leaner CPU/nav (0.55 vs real-router 0.88) but retains MORE heap (1035 KB vs 549).** navsPerSec ~121 for both (frame-capped) — read CPU/nav + heap.

| metric | real-router | angular-router |
|---|---|---|
| ≈ total / nav (ms) | 0.943 | **0.570** |
| · script / nav (V8) (ms) | 0.648 | **0.279** |
| · Blink / nav (pushState) (ms) | **0.293** | 0.294 |
| heap retained (200 navs) (KB) | **556** | 1035 |
| throughput (frame-capped) (/s) | **121** | 121 |

## Active links (100) — per-nav total (script + history) — `active-links`

Per-nav total recompute across 100 links (steady-state toggle). **real-router WINS — ~2× lighter** — its shared cached active-source (one `router.subscribe`) beats `@angular/router`'s per-link `routerLinkActive` router-event subscription. real-router's clearest win in this cohort — and part of its cross-cohort active-links lead (React + Svelte win too). *(The ~2× win is robust; absolute ms session/load-dependent.)*

| metric | real-router | angular-router |
|---|---|---|
| ≈ total main-thread (ms) | **0.570** | 1.05 |
| · script (V8 only) (ms) | **0.281** | 0.752 |
| · Blink history (pushState) (ms) | **0.294** | 0.304 |

## Back / forward — per-nav total, browser history traversal (popstate) — `back-forward`

Browser **back/forward** (popstate) steady-state. **@angular/router leanest (~0.85 ms) — real-router #2 (~1.22, +44%).** **#1353** (skip no-op popstate `replaceState`) **halved** real-router's gap (was ~2×) — @angular/router's lean single-popstate still leads, but real-router's redundant-write penalty is gone. real-router the leaner **allocator** (~0.12 < @angular/router 0.42). *(n=15.)*

| metric | real-router | angular-router |
|---|---|---|
| ≈ total main-thread (ms) | 1.22 | **0.846** |
| · script (V8 only) (ms) | 0.479 | **0.281** |
| · Blink history (popstate) (ms) | 0.689 | **0.559** |
| alloc / nav (GC pressure) (KB) | **0.117** | 0.416 |

## Link build — mount 1000 links (href construction) — `link-build`

CPU to mount 1000 links, each building its href. **real-router leaner — 12.58 ms** vs @angular/router 17.45, though both are heavy over the bare-`<a>` floor (5.01). real-router's `RealLink` runs the reverse-matcher (`buildPath`); `@angular/router`'s `routerLink` serializes a URL tree (config-independent) — different mechanisms, both costly. (`RealLink`'s active state already uses the shared active-name selector fast path (#1104); the residual is `buildPath` per link + directive/effect setup, not a per-link subscription.)

| metric | real-router | angular-router |
|---|---|---|
| script (1000 links) (ms) | **12.60** | 17.44 |

## Nested switch (reuse) — per-nav total (script + history) — `nested-switch`

Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **@angular/router leaner; real-router second** on this sub-ms per-nav-render metric. *(Sub-ms — session/load-dependent.)*

| metric | real-router | angular-router |
|---|---|---|
| ≈ total main-thread (ms) | 0.629 | **0.474** |
| · script (V8 only) (ms) | 0.337 | **0.171** |
| · Blink history (pushState) (ms) | **0.291** | 0.302 |

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
| cold-start script (ms) | 1.74 | 6.20 (+4.5) | 2.07 (+0.3) |
| cold-start heap (MB) | 2.80 | 3.54 (+0.7) | 3.29 (+0.5) |
| link-build script (ms) | 5.01 | 12.60 (+7.6) | 17.44 (+12.4) |

**Reading:** over bare Angular, `@angular/router` adds very little at boot (~0.3 ms); real-router adds ~4.3 ms at boot (upfront trie build). (Per-nav is not shown here: the naive manual click→pushState→signal baseline is heavier than either optimized router, so it is ranked router-vs-router in the tables above.)

## What this does NOT measure / caveats

- **No cross-framework ranking** — both columns are the same framework (Angular); the delta is router work.
- **`@angular/router` is the only serious Angular router** — no third-party standalone alternatives exist (unlike React/Vue/Solid/Svelte), so this is a two-engine cohort by ecosystem reality, not exclusion.
- **Deep-config is directional** — both rise O(depth), not decomposed for Angular. #1094's Solid research found the analogous rise was ~60% a Solid-specific bench-app artifact + adapter bugs (fix is `packages/solid`-only). Real apps rarely nest past ~10.
- **real-router's heavier cold-start (~3× the boot script) is the upfront segment-trie build** (createRouter + start) — cross-cohort-consistent (~4.5–7 ms across solid/svelte/angular), the price of O(1) matching paid at boot; a design trade-off, not a defect.
- **`@real-router/angular` `<Link>` link-build** — the shared active-name selector fast path already shipped (#1104, parallel to Svelte's #1101); the residual link-build cost is `buildPath` per link (inherent — React/Solid rr pay it and still win link-build) + Angular directive/effect instantiation, not a per-link subscription.
- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.
- `wide`/`deep` are scaling sweeps — the per-size *curve* matters (both flat on wide; deep both O(depth)).
- **real-router `nav-latency` `script` is near timer granularity** (sub-0.6 ms → inflated *relative* variance); at n=30 it sits within the RME gate. The nav-latency *total* + the headline findings (cold-start, wide/deep sweeps, table-heap, active-links, link-build) rest on stable, larger-magnitude signals (RME < ~5%).

Regenerate: `node cross-router/run-all.mjs && node cross-router/harness/report.mjs angular`.

