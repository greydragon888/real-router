#!/usr/bin/env node
// Build cross-router/REPORT[-<framework>].md from results/<framework>/<scenario>/<engine>.json.
// Tables are auto-generated (median per metric, winner bolded); the narrative /
// caveats are curated per framework in FW. Per-cohort only — no cross-framework
// ranking (D1).  Usage: node cross-router/harness/report.mjs [framework=react]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(dirname(fileURLToPath(import.meta.url))); // cross-router/
const FRAMEWORK = process.argv[2] || "react";
const RESULTS = `${here}/results/${FRAMEWORK}`;
const FEATURES = existsSync(`${RESULTS}/features.json`)
  ? JSON.parse(readFileSync(`${RESULTS}/features.json`, "utf8"))
  : {};

// Scenario row configs (metric keys/labels) — framework-agnostic. Blurbs live
// per-framework in FW[*].blurbs so each cohort tells its own story.
const SCENARIOS = [
  { id: "cold-start", title: "Cold start", rows: [["scriptDurationMs", "main-thread script", "ms", "lower"], ["jsHeapMB", "JS heap", "MB", "lower"], ["fcpMs", "FCP", "ms", "lower"]] },
  { id: "nav-latency", title: "Navigation — per-nav total main-thread (script + history)", rows: [["totalMs", "≈ total main-thread", "ms", "lower"], ["scriptDurationMs", "· script (V8 only)", "ms", "lower"], ["blinkMs", "· Blink history (pushState)", "ms", "lower"]] },
  { id: "param-nav", title: "Param navigation — per-nav total (script + history)", rows: [["totalMs", "≈ total main-thread", "ms", "lower"], ["scriptDurationMs", "· script (V8 only)", "ms", "lower"], ["blinkMs", "· Blink history (pushState)", "ms", "lower"]] },
  { id: "wide-config", title: "Wide config — matcher breadth (sweep)", rows: [["totalMs@10", "≈ total @10", "ms", "lower"], ["totalMs@100", "≈ total @100", "ms", "lower"], ["totalMs@1000", "≈ total @1000", "ms", "lower"], ["scriptMs@10", "· script (matcher) @10", "ms", "lower"], ["scriptMs@100", "· script (matcher) @100", "ms", "lower"], ["scriptMs@1000", "· script (matcher) @1000", "ms", "lower"]] },
  { id: "table-heap", title: "Route-table memory — heap to hold N routes (sweep)", rows: [["jsHeapMB@1", "heap @1 (floor)", "MB", "lower"], ["jsHeapMB@1000", "heap @1k", "MB", "lower"], ["jsHeapMB@10000", "heap @10k", "MB", "lower"]] },
  { id: "deep-config", title: "Deep config — nesting depth (sweep)", rows: [["totalMs@3", "≈ total @3", "ms", "lower"], ["totalMs@30", "≈ total @30", "ms", "lower"], ["totalMs@60", "≈ total @60", "ms", "lower"], ["totalMs@90", "≈ total @90", "ms", "lower"], ["scriptMs@3", "· script (matcher) @3", "ms", "lower"], ["scriptMs@30", "· script (matcher) @30", "ms", "lower"], ["scriptMs@60", "· script (matcher) @60", "ms", "lower"], ["scriptMs@90", "· script (matcher) @90", "ms", "lower"]] },
  { id: "param-scaling", title: "Param scaling — path-param count (sweep)", rows: [["totalMs@1", "≈ total @1", "ms", "lower"], ["totalMs@10", "≈ total @10", "ms", "lower"], ["totalMs@100", "≈ total @100", "ms", "lower"], ["scriptMs@1", "· script (matcher) @1", "ms", "lower"], ["scriptMs@10", "· script (matcher) @10", "ms", "lower"], ["scriptMs@100", "· script (matcher) @100", "ms", "lower"]] },
  { id: "nav-churn", title: "Nav churn (stress)", rows: [["totalMsPerNav", "≈ total / nav", "ms", "lower"], ["scriptMsPerNav", "· script / nav (V8)", "ms", "lower"], ["blinkMsPerNav", "· Blink / nav (pushState)", "ms", "lower"], ["heapDeltaKB", "heap retained (200 navs)", "KB", "lower"], ["navsPerSec", "throughput (frame-capped)", "/s", "higher"]] },
  { id: "active-links", title: "Active links (100) — per-nav total (script + history)", rows: [["totalMs", "≈ total main-thread", "ms", "lower"], ["scriptDurationMs", "· script (V8 only)", "ms", "lower"], ["blinkMs", "· Blink history (pushState)", "ms", "lower"]] },
  { id: "link-build", title: "Link build — mount 1000 links (href construction)", rows: [["scriptMs", "script (1000 links)", "ms", "lower"]] },
  { id: "nested-switch", title: "Nested switch (reuse) — per-nav total (script + history)", rows: [["totalMs", "≈ total main-thread", "ms", "lower"], ["scriptDurationMs", "· script (V8 only)", "ms", "lower"], ["blinkMs", "· Blink history (pushState)", "ms", "lower"]] },
];

const REACT_BLURBS = {
  "cold-start": "App init + parse/exec to first route painted (small route table).",
  "nav-latency": "Per-navigation **total main-thread** (script + Blink history, both harness-measured). **real-router is the lightest — 0.52 ms/nav total**, below react-router (0.68) and tanstack (0.70), winning *both* components (script 0.40 and Blink history 0.11 — lowest of the three). Unlike the Vue cohort (where vue-router's 2×-`pushState` brings it to parity), all React routers hit history ~1×/nav, so real-router's lean script carries straight through to a clear total win. (15 runs; `total` = `script` (V8/`ScriptDuration`) + Blink `updateForSameDocumentNavigation`.)",
  "param-nav": "Per-nav total changing :id (steady-state sweep /users/1→2→3…). **real-router lightest — 0.55 ms total** vs tanstack 0.73 / react-router 0.70 (lowest script; Blink ~equal).",
  "wide-config": "Navigate into a flat 1000-route table; per size **total** (script + Blink) + **script** (matcher). Flat curve = O(1)/trie, rising = O(N)/scan. **real-router stays flat and wins every size** (~0.50 total); tanstack flat-higher (~0.9); react-router degrades @1000 (0.80 → 1.50, O(N)). The matcher win holds on total, not just script.",
  "table-heap": "Retained JS heap holding a table of 1 / 1000 / 10000 routes (forced GC; @1 ≈ the React/app floor). The memory counterpart to wide-config. real-router's segment trie *historically* cost the most here — but heap-profiling traced the bulk to **empty per-route collections + redundant indexes, not the trie itself**, and **#1009 + #1010 removed them** (shared frozen sentinels, a monomorphic `CompiledRoute`, and dropping two duplicate `name→route` maps). At 10k real-router went from **heaviest (~1.85×) to the lightest** of the three (~0.63 KB/route, just under react-router) while keeping the flat O(1) match — the benchmark drove a real core optimization. The trie's genuine space-for-time cost turned out small; the rest was fixable slack. heap is the most stable signal (RME < 0.01%).",
  "deep-config": "Navigate into a 90-level nested chain (sweep 3 / 30 / 60 / 90). **real-router and tanstack scale cleanly and monotonically** — real-router is lowest at every realistic depth. **react-router's curve is a parabola** (fine-grained: rises to ~6 ms near depth 45–60 — ~4× real-router — then declines back to ~1.7 ms at depth 90; the 60→90 drop is the parabola's right tail, not a threshold). Root cause (CPU-profiled + confirmed in react-router source): `matchRoutes` tries route branches **deepest-first** (`computeScore` ranks more segments higher) and re-matches every *deeper* branch before reaching the target — so depth D wastes `O((maxDepth−D)×D)` path re-normalization (`matchRouteBranch`/`joinPaths`/`removeDoubleSlashes`) on branches that fail; maximal mid-depth, zero only when the target *is* the deepest route. real-router walks its precompiled segment trie straight to the match (O(depth), no branch-retrying, no per-nav string normalization) — hence the clean low curve. Real apps rarely nest past ~10, where real-router wins outright regardless. (Table is total@D + script@D; the matcher/parabola story lives in `script`; on total real-router edges @90 too.)",
  "param-scaling": "Navigate into routes with 1 / 10 / 100 path params; **total** + **script** (matcher). Param count is **~a non-factor** (per-param extraction is sub-µs, dwarfed by React render — flat-ish for all, only a slight bump @100). **real-router wins every size** (total 0.58–0.69); tanstack highest, react-router middle.",
  "nav-churn": "200-nav stress; per-nav total (script + Blink) + heap. **react-router lightest CPU/nav (0.55 total)**, real-router 0.77, tanstack 1.13 — but **real-router retains the least heap (692 KB)**. navsPerSec frame-capped.",
  "active-links": "Per-nav total recompute across 100 links (steady-state toggle). **real-router lightest by a wide margin — 0.79 ms vs ~1.5–1.6** (~2× lighter; cached active-source per link). Blink ~equal.",
  "link-build": "CPU to mount 1000 `<Link>`s at once — each builds its href via the router's reverse-matcher (`buildPath` / `generatePath` / `buildLocation`), isolated from route construction (done once at startup). A real cost for link-heavy pages (nav menus, sitemaps, paginated lists). real-router and react-router are **close** (~10 ms, the ranking flips run-to-run); tanstack is ~1.6× slower.",
  "nested-switch": "Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **real-router lightest — 0.51 ms total** vs tanstack 0.69 / react-router 0.64.",
};


const VUE_BLURBS = {
  "cold-start": "App init + parse/exec to first route painted. vue-router is the lightest to boot, real-router middle, tanstack heaviest.",
  "nav-latency": "Per-navigation main-thread script, **steady-state** (N navs ÷ N, each fully completing before the next — so async routers' deferred work *is* counted; this is a fair total, not a sync-vs-async artifact). **vue-router is exceptionally lean (~0.043 ms/nav — the lightest router in any cohort here):** Vue's fine-grained reactivity turns a route change into a minimal reactive-ref update + `<RouterView>` swap. real-router (~0.18) and tanstack (~0.17) are ~4× heavier **in `script`** — but that ratio is **`ScriptDuration` (V8-only)** and excludes Blink C++. A CDP **trace** shows the dominant per-nav cost is Blink's `updateForSameDocumentNavigation` (the `history.pushState` work), which **vue-router triggers 2×/nav** (`replaceState`+`pushState`) vs real-router **1×**. Counting it, **all three are at PARITY — ~0.32 ms/nav (within ~3%): real-router 0.317 ≈ vue-router 0.327 ≈ tanstack 0.314** (15 runs). vue-router's ~4× lean script (0.037) is *exactly* offset by its 2× Blink history (0.30 vs real-router's 0.18); real-router is balanced (script 0.15 + Blink 0.18). So '4× lighter vue-router nav' is a `ScriptDuration` artifact — fairly counted, the three are equal. The harness now reports total + script + Blink (this is reproducible, not hand-recorded). (Blink is CDP-traced — per-call absolute noisy ~0.06–0.13 ms, but the count 2× vs 1× is exact from each router's source.) real-router's small residual script edge is navigate render/emit — **not** the adapter (a lean native-`computed` Link does not close it), **not** history, **not** the core (pure-Node 0.79 µs, lighter than vue-router). real-router's Vue nav is fast absolutely — under one frame, below its own React number (~0.38).",
  "param-nav": "Per-nav total changing :id (steady-state sweep). **vue-router lightest (0.38), tanstack 0.43, real-router 0.48 (~1.26×)** — the script-only ~5× shrinks to ~1.3× in total (vue-router's 2× Blink).",
  "wide-config": "Navigate into a flat 1000-route table — **the matcher crossover.** vue-router is lightest at small N (lean Vue floor: ~0.16 total @10/@100) but **degrades @1000 to 0.434** (O(N) matcher); **real-router stays flat (~0.24) and WINS @1000** — 0.240 < vue-router 0.434, tanstack 0.293 — on **total**, not just script (0.177 vs 0.350). The trie's structural win at scale survives the honest metric.",
  "table-heap": "Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **real-router is the lightest at 10k (~0.64 KB/route — the #1009/#1010-optimized trie)**, beating vue-router (~1.19 KB/route) and tanstack (~0.90). At scale real-router wins both CPU (wide) and memory.",
  "deep-config": "Navigate into a 90-level nested chain; **total** + **script** (matcher). **real-router and vue-router stay flat** (real-router ~0.30 total; vue-router ~0.18 — its leaner per-nav floor); **tanstack rises O(depth)** (0.38 → 1.17, ~3× by @90). Both full pipelines stay flat — matcher/composition doesn't degrade; tanstack's deep-nav cost grows. Real apps rarely nest past ~10.",
  "param-scaling": "Routes with 1 / 10 / 100 path params — **floor-bound, matcher barely stressed.** **vue-router lightest** (~0.13–0.17 total, its lean Vue per-nav floor), real-router ~0.27–0.37, tanstack highest. Param count ~a non-factor for all; the gap is the per-nav floor, **not** param extraction — contrast wide@1000, where the matcher IS stressed and real-router wins.",
  "nav-churn": "200-nav stress; per-nav total (script + Blink) + heap. **vue-router lightest CPU/nav (0.54 total)**, tanstack 0.58, real-router 0.67; **real-router retains the least heap (509 ≈ vue-router; tanstack ~2× at 1071)**. navsPerSec frame-capped.",
  "active-links": "Per-nav total recompute across 100 links (steady-state toggle). **tanstack 0.36 / vue-router 0.41 / real-router 0.47** — all tight (~1.3×), unlike the React cohort's wide spread.",
  "link-build": "CPU to mount 1000 links, each building its href (real-router `buildPath` · vue-router `resolve` · tanstack build). vue-router leanest; real-router and tanstack close.",
  "nested-switch": "Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **vue-router lightest (0.23), tanstack 0.34, real-router 0.45 (~1.9×)**.",
};

const SOLID_BLURBS = {
  "cold-start": "App init + parse/exec to first route painted. **@solidjs/router is the lightest to boot** (heap 2.48 MB, script 2.80 ms); real-router middle (2.78 / 4.54), tanstack heaviest (3.09 / 4.12). Over the bare-Solid floor (2.29 MB heap / 0.88 ms) all three add little.",
  "nav-latency": "Per-navigation total (script + Blink history), steady-state. **real-router is the leanest per-nav total — 0.262 ms** (< tanstack 0.315 < @solidjs/router 0.336), essentially the bare-Solid floor (0.246). This *inverts* the raw `script` order (real-router 0.078 > @solidjs/router 0.066): @solidjs/router's leaner script is offset by heavier Blink history, so on the honest total real-router edges it. Unlike the Vue cohort (vue-router leanest), here real-router owns the lightest per-nav.",
  "param-nav": "Per-nav total changing :id (steady-state). **@solidjs/router (0.243) ≈ tanstack (0.245) lead; real-router 0.302** — the ~3× script gap (rr 0.15 vs @solidjs/router 0.045) shrinks to ~1.25× on total.",
  "wide-config": "Navigate into a flat 1000-route table. **All three matchers are FLAT** (no O(N) degradation): @solidjs/router total ~0.16, tanstack ~0.24, real-router ~0.38 across @10/@100/@1000. The differentiator is the per-nav FLOOR, not matcher scaling — **@solidjs/router's minimal pipeline is the leanest floor; real-router's full pipeline (transition + browser-plugin History) is the heaviest**, but flat. (Contrast React/Vue, where a competitor's matcher degrades O(N) and real-router's trie wins @1000 — here no competitor degrades, so the trie's structural edge doesn't separate them.)",
  "deep-config": "Navigate into a 90-level nested chain. **@solidjs/router stays flat (~0.17 total); real-router rises O(depth) — 0.56 → 6.40 ms @90** (script 0.49 → 6.33). The core segment-trie matcher is O(depth) but cheap (the Vue adapter keeps deep-nav flat at ~0.24 ms @90); the steep rise here is **`@real-router/solid`'s `RouteView` deep-composition cost — a per-level re-render scaling with depth (#1094)**, not the core matcher. **@tanstack/solid-router is N/A** — it triggers its internal error boundary on 60+-segment deep routes (the @tanstack/react-router equivalent renders depth 90). Real apps rarely nest past ~10, where the gap is ~1 ms.",
  "param-scaling": "Routes with 1 / 10 / 100 path params — floor-bound (matcher barely stressed). **@solidjs/router leanest (~0.17 total, flat); real-router ~0.44–0.52; tanstack ~0.26–0.29.** Param count ~a non-factor for all; the gap is the per-nav floor, not param extraction.",
  "table-heap": "Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **@solidjs/router lightest at 10k (5.61 MB); real-router 8.27; tanstack heaviest (10.66).** Unlike the React/Vue cohorts (real-router's trie wins memory), @solidjs/router's minimal route storage is leaner here.",
  "nav-churn": "200-nav stress; CPU/nav + retained heap. **CPU/nav is tight — real-router 0.063 ≈ @solidjs/router 0.065, tanstack ~2× (0.118); @solidjs/router retains the least heap (235 KB), real-router 315, tanstack 635.** `navsPerSec` is NOT comparable here: real-router navigates synchronously (churns 200 navs without yielding to frames → ~14.7k/s) while @solidjs/router + tanstack defer to the frame cadence (~123/s) — read CPU/nav + heap.",
  "active-links": "Per-nav total recompute across 100 links (steady-state toggle). **All three tight — real-router 0.219 ≈ @solidjs/router 0.223 < tanstack 0.234** (unlike the React cohort's wide spread). @solidjs/router's `<A>` is inherently active-aware; real-router recomputes a cached active-source per link.",
  "link-build": "CPU to mount 1000 links, each building its href. **real-router leanest (9.4 ms); @solidjs/router 10.3; tanstack ~3× (29.1).** Over the bare-`<a>` floor (2.0 ms) real-router adds the least reverse-matcher cost.",
  "nested-switch": "Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **tanstack leanest here (0.249), @solidjs/router 0.323, real-router 0.357** — one of the few per-nav-render metrics real-router trails (the adapter floor again, cf. deep-config).",
};

const FW = {
  react: {
    cohortName: "React cohort",
    engines: ["real-router", "tanstack", "react-router"],
    blurbs: REACT_BLURBS,
    baselineLabel: "bare React",
    warningLine: "⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the **stable signals only** — CPU (`script`), heap, FCP (all RME < 5%). Felt **latency was deliberately dropped** (its RME was 9–44% across every scenario — React render + display-frame cadence dominate, not router work; see *Why no latency* at the end). `nav-churn` throughput is frame-capped — read CPU/nav + heap. **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ — notably `history.pushState`'s `updateForSameDocumentNavigation` (~130 µs/nav, CDP-traced) and paint — which is ~identical across routers, so `script` *ratios* overstate the *total* per-nav gap (e.g. a ~4× `script` ratio is ≈ parity in total — Vue cohort all ~0.32 ms, CDP-traced + harness-reported).",
    cohortLine: "**Cohort:** `@real-router/react` + `@real-router/browser-plugin` · `react-router@8` (Data mode) · `@tanstack/react-router` — routers that own a navigation pipeline (route-graph resolution, guard/lifecycle phases, immutable state, data).",
    scopeNote: "**Scope — `wouter` is deliberately excluded** (a scoping choice stated up front, not a result). It is a minimalist location-matcher (regexparam matching + a location hook) — a *different class*: no transition pipeline, guards, loaders, or validated search, and **no cross-framework analog** (React/Preact only), so it cannot appear in the Vue/Solid/Svelte/Angular cohorts these benchmarks expand to. Benchmarking it here compares apples to oranges — its low per-nav cost reflects doing less, not faster engineering — and dilutes a like-for-like comparison of full routers. (See `.claude/competitor-routers.md` for wouter's place in the landscape.)",
    capabilityIntro: "Even among full routers, first-class API coverage differs. `✓` = built-in API, `N/A` = none (would be hand-rolled in user-land) — verified against each router's real surface, so **`N/A` is feature-absence, not a speed loss**. The cost of these features is sub-µs/noise, so these are capability axes, not benchmarks (`data-on-navigation` also differs semantically per engine — same goal, different model — so it is not a 1:1 perf race either).",
    capabilities: [
      { feature: "Data on navigation (loader tied to route)", key: "data", support: { "real-router": "✓", tanstack: "✓", "react-router": "✓" }, basis: "rr: `onEnter` + `lifecycle`/`preload` plugin · react-router: `loader`/`useLoaderData` · tanstack: `loader`" },
      { feature: "Typed / validated search params (schema)", key: "search", support: { "real-router": "✓", tanstack: "✓", "react-router": "N/A" }, basis: "rr: `searchSchema` (zod) · tanstack: `validateSearch` (zod) · react-router: raw `useSearchParams` only (no validation)" },
      { feature: "Blocking guard (canDeactivate / unsaved-changes)", key: "guard", support: { "real-router": "✓", tanstack: "✓", "react-router": "✓" }, basis: "rr: `canDeactivate` · react-router: `useBlocker` · tanstack: `useBlocker`" },
      { feature: "Built-in scroll restoration", support: { "real-router": "✓", tanstack: "✓", "react-router": "✓" }, basis: "rr: `<RouterProvider scrollRestoration>` · react-router: `<ScrollRestoration>` · tanstack: `scrollRestoration: true`" },
    ],
    capabilityLegend: "`✓ⁱ` = **verified in-harness** — a functional demo app (`apps/react/<engine>/{data,search,guard}/`) the harness builds, drives, and asserts via `node cross-router/harness/verify-features.mjs` (data loaded on nav · `?n=5` typed to a number · leave blocked while dirty, allowed after Save). `✓` without `ⁱ` is API-verified only (scroll-restoration). `N/A` = no first-class API.",
    capabilityReading: "**Reading:** `real-router` and `tanstack` cover all four axes; `react-router` lacks first-class validated search (you parse `useSearchParams` by hand). Perf and capability are causally linked: a router's per-navigation cost buys a real pipeline — resolve the route node in the tree, compute the deactivate/activate path between current and target routes, run guard + lifecycle phases (no-ops when none are registered), build a fresh immutable state — the machinery that makes guards / data-loading / validated-search possible. A pipeline-less location-matcher (the excluded `wouter`, see **Scope** above) is cheaper per navigation precisely because it does none of this — a different class, not a faster one. So speed and surface are read together, not in isolation.",
    baselineNote: "`_baseline` is the same pages with **no router** — manual `useState` + `history.pushState` for navigation, raw `<a>` for links. It is the floor: subtract it and what remains (`+Δ`) is each router's own marginal cost. (Matcher sweeps and route-table memory have no bare-React analog, so they are omitted.)",
    baselineReading: "**Reading:** the `(+Δ)` is the router's marginal cost over bare React. On the **per-navigation hot path real-router adds the least** — its transition pipeline is the lightest marginal cost over bare React, well under react-router's and roughly half tanstack's. It is near-lowest on link overhead too; **tanstack pays ~2× the router overhead** on startup and links. real-router's cold-start overhead sits a little above react-router's — partly the `browser-plugin` (real History API) it carries by contract — but both are far below tanstack. Net: subtract React, and real-router's router cost is smallest where it matters most (navigation).",
    caveats: [
      "- **No cross-framework ranking** — each column is the same framework (React); the delta is router work.",
      "- **Why no latency.** Wall-clock felt-latency was measured but **excluded**: across all 99 raw metrics its RME was 9–44% (vs < 5% for CPU/heap). A 20-nav warm diagnostic showed click→paint is dominated by React's render + the display-frame cadence (≈ one 60 fps frame), ~identical across engines — so it is not router-attributable. The router's real contribution is CPU (`script`), reported here. (Raw `latencyMs` is still in `results/*.json`.)",
      "- **`nav-churn` navsPerSec is frame-capped** — not a router differentiator; CPU/nav + retained heap are.",
      "- **FCP** (cold-start) is inherently jittery; treat `script`/`heap` as primary there.",
      "- Each router is configured the idiomatic way for a plain SPA (not gimped). `real-router` includes `browser-plugin` (real History API) — that weight is part of its cold-start/bundle by contract.",
      "- `wide`/`deep` are **scaling sweeps** — the per-size *curve* (does cost grow with N/D) matters more than any single point.",
    ],
  },
  vue: {
    cohortName: "Vue cohort",
    engines: ["real-router", "vue-router", "tanstack"],
    blurbs: VUE_BLURBS,
    baselineLabel: "bare Vue",
    warningLine: "⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the **stable signals** — CPU (`script`), heap, FCP. Felt latency was dropped (render/frame-bound, not router-attributable). `nav-churn` throughput is frame-capped — read CPU/nav + heap. **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ — notably `history.pushState`'s `updateForSameDocumentNavigation` (~130 µs/nav, CDP-traced) and paint — which is ~identical across routers, so `script` *ratios* overstate the *total* per-nav gap (e.g. a ~4× `script` ratio is ≈ parity in total — Vue cohort all ~0.32 ms, CDP-traced + harness-reported).",
    cohortLine: "**Cohort:** `@real-router/vue` · `vue-router@4` (the official Vue 3 router) · `@tanstack/vue-router` — three full routers that own a navigation pipeline (route resolution, guards, nested layouts, reactive/immutable state). `vue-router@5` is excluded because it pulls `pinia`/`@pinia/colada` as peer deps, which would inflate non-router metrics; v4 is the self-contained Vue 3 standard.",
    scopeNote: "**Scope — three full routers, like-for-like.** Unlike the Preact cohort, no minimalist exclusion is needed: all three own a real navigation pipeline. vue-router 4 is the official Vue 3 router; tanstack is the type-first challenger. The honest split that emerges along **two axes (don't conflate them)**: on **scale** — route tables/depth, i.e. the matcher + memory (wide-config @1000, table-heap @10k, deep) — **real-router wins** (O(1) trie + lean core); on **per-nav render** — small tables, heavy re-render (param-nav, active-links, nested-switch) — **vue-router's native reactivity is leaner** (the Vue-adapter soft spot, *not* the core). A heavy *route table* ≠ a heavy *render*. **tanstack is heaviest on memory and degrades at depth**.",
    capabilityIntro: "Among three full routers, first-class API coverage still differs. `✓` = built-in API, `N/A` = none (hand-rolled in user-land). The differentiator here is validated search — vue-router exposes raw query only, exactly the gap react-router has in the React cohort.",
    capabilities: [
      { feature: "Data on navigation (loader tied to route)", support: { "real-router": "✓", "vue-router": "✓", tanstack: "✓" }, basis: "rr: `onEnter` + `lifecycle`/`preload` plugin · vue-router: `beforeRouteEnter` guard (imperative; no first-class loader/useLoaderData) · tanstack: `loader`" },
      { feature: "Typed / validated search params (schema)", support: { "real-router": "✓", "vue-router": "N/A", tanstack: "✓" }, basis: "rr: `searchSchema` (zod) · vue-router: raw `route.query` only (no validation) · tanstack: `validateSearch` (zod)" },
      { feature: "Blocking guard (canDeactivate / unsaved-changes)", support: { "real-router": "✓", "vue-router": "✓", tanstack: "✓" }, basis: "rr: `canDeactivate` · vue-router: `onBeforeRouteLeave` · tanstack: `useBlocker`" },
      { feature: "Built-in scroll restoration", support: { "real-router": "✓", "vue-router": "✓", tanstack: "✓" }, basis: "rr: `<RouterProvider scrollRestoration>` · vue-router: `scrollBehavior` · tanstack: `scrollRestoration: true`" },
    ],
    capabilityLegend: "`✓` / `N/A` are API-verified against each router's surface (the in-harness `✓ⁱ` demo verification exists for the React cohort; `@real-router/vue` shares that pipeline). `N/A` = feature-absence, not a speed loss.",
    capabilityReading: "**Reading:** all three cover data-on-navigation, blocking guards, and scroll restoration; **vue-router lacks first-class validated search** (raw `route.query` — you validate by hand), exactly the gap react-router has in the React cohort. real-router and tanstack offer schema-validated search. Perf and capability read together — vue-router's leanness partly reflects a smaller surface, while real-router's scale wins (the trie) come bundled with the full pipeline.",
    baselineNote: "`_baseline` is the same pages with **no router** — manual `ref` + `history.pushState`, raw `<a>`. Subtract it and `+Δ` is each router's marginal cost.",
    baselineReading: "**Reading:** over bare Vue, vue-router adds the least on startup (+2.1 ms) and its reactivity-driven nav is so targeted it can beat the naive full-re-render baseline; real-router is middle (+3.1 cold-start), tanstack heaviest (+4.3). The marginal costs are small — at realistic scale all three are fast. The separation appears **at scale** (wide / table-heap / deep), where real-router's trie wins CPU *and* memory and tanstack degrades.",
    caveats: [
      "- **No cross-framework ranking** — each column is the same framework (Vue); the delta is router work. (Do NOT compare to the React/Preact cohorts.)",
      "- **vue-router 4, not 5** — v5 pulls `pinia`/`@pinia/colada` as peers (would inflate non-router metrics); v4 is the self-contained Vue 3 standard.",
      "- **`nav-churn` navsPerSec is frame-capped** — CPU/nav + retained heap differentiate.",
      "- `real-router` includes `browser-plugin` (real History API) — part of its cold-start by contract.",
      "- `wide`/`deep` are scaling sweeps — the per-size *curve* matters more than any single point (real-router flat; vue-router degrades at wide @1000; tanstack at deep).",
    ],
  },
  solid: {
    cohortName: "Solid cohort",
    engines: ["real-router", "solid-router", "tanstack"],
    blurbs: SOLID_BLURBS,
    baselineLabel: "bare Solid",
    warningLine: "⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the stable signals — CPU (`script`), heap, FCP. Felt latency was dropped (render/frame-bound). **`nav-churn` navsPerSec is NOT comparable in this cohort** (real-router navigates synchronously; the others yield to frames) — read CPU/nav + heap. **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ (`history.pushState` ~identical across routers), so `script` ratios overstate the `total` per-nav gap.",
    cohortLine: "**Cohort:** `@real-router/solid` · `@solidjs/router` (the official Solid router) · `@tanstack/solid-router` — three full routers, like-for-like. Solid JSX apps (`vite-plugin-solid`, `dedupe: ['solid-js']`).",
    scopeNote: "**Scope — three full routers, like-for-like** (no minimalist exclusion needed). The honest picture, DIFFERENT from the React/Vue cohorts: **`@solidjs/router` is a remarkably lean router** and leads most raw numbers — cold-start heap, param-nav, the wide/param-scaling floor, deep (flat), table-heap memory, nav-churn heap. **real-router leads the pipeline-light per-nav metrics** — nav-latency (0.262, the leanest per-nav total here), link-build, active-links — and brings the full pipeline (guards, validated search, data, scroll). Two adapter soft-spots surface: real-router's heaviest per-nav FLOOR at scale (transition pipeline + browser-plugin History), and **`@real-router/solid`'s deep-nesting `RouteView` cost rising O(depth) (#1094)** — an adapter issue, not the (framework-agnostic, flat-capable) core. **`@tanstack/solid-router` is generally heaviest** and cannot render 60+-deep nested routes (errors).",
    capabilityIntro: "Among three full routers, first-class API coverage differs. `✓` = built-in API, `N/A` = none (hand-rolled). Differentiators: `@solidjs/router` lacks validated search AND first-class scroll restoration — its leanness partly reflects a smaller surface.",
    capabilities: [
      { feature: "Data on navigation (loader tied to route)", support: { "real-router": "✓", "solid-router": "✓", tanstack: "✓" }, basis: "rr: `onEnter` + `lifecycle`/`preload` plugin · @solidjs/router: `preload` + `query`/`createAsync` · tanstack: `loader`" },
      { feature: "Typed / validated search params (schema)", support: { "real-router": "✓", "solid-router": "N/A", tanstack: "✓" }, basis: "rr: `searchSchema` (zod) · @solidjs/router: raw `useSearchParams` only (no validation) · tanstack: `validateSearch` (zod)" },
      { feature: "Blocking guard (canDeactivate / unsaved-changes)", support: { "real-router": "✓", "solid-router": "✓", tanstack: "✓" }, basis: "rr: `canDeactivate` · @solidjs/router: `useBeforeLeave` · tanstack: `useBlocker`" },
      { feature: "Built-in scroll restoration", support: { "real-router": "✓", "solid-router": "N/A", tanstack: "✓" }, basis: "rr: `<RouterProvider scrollRestoration>` · @solidjs/router: hash/top scroll only (no first-class saved-position restoration) · tanstack: `scrollRestoration: true`" },
    ],
    capabilityLegend: "`✓` / `N/A` are API-verified against each router's surface (the in-harness `✓ⁱ` demo verification exists for the React cohort; `@real-router/solid` shares that pipeline; the `apps/solid/real-router/{data,search,guard}` demo apps exist as dogfooding — in-harness `✓ⁱ` for solid is a follow-up). `N/A` = feature-absence, not a speed loss.",
    capabilityReading: "**Reading:** real-router and tanstack cover all four axes; **`@solidjs/router` lacks validated search AND first-class scroll restoration** (raw query + hash-scroll). Its leanness in the perf tables partly reflects this smaller surface — a lean matcher-router vs a full pipeline. Perf and capability read together.",
    baselineNote: "`_baseline` is the same pages with **no router** — manual `createSignal` + `history.pushState`, raw `<a>`. Subtract it and `+Δ` is each router's marginal cost.",
    baselineReading: "**Reading:** over bare Solid, all three add little on the hot path. real-router adds the least on navigation (nav-latency ≈ the floor) and links; @solidjs/router adds the least on cold-start. The separation is at scale (floor) and deep nesting (the adapter), not on the simple hot path.",
    caveats: [
      "- **No cross-framework ranking** — each column is the same framework (Solid); the delta is router work. (Do NOT compare to the React/Vue cohorts.)",
      "- **`@tanstack/solid-router` deep-config is N/A** — it triggers its internal error boundary on 60+-segment deep-nested routes (renders depth 3/30, errors at 60/90). The `@tanstack/react-router` equivalent renders depth 90; a @tanstack/solid-router limitation, reproducible in-harness (`node cross-router/run.mjs deep-config tanstack solid`).",
      "- **`@real-router/solid` deep-nesting rises O(depth)** — the `RouteView` composition cost, tracked as #1094 (an adapter issue; the core matcher is flat-capable, cf. the Vue cohort at ~0.24 ms @90). Real apps rarely nest past ~10.",
      "- **`nav-churn` navsPerSec is NOT comparable** — real-router navigates synchronously (~14.7k/s), @solidjs/router + tanstack yield to frames (~123/s). Read CPU/nav + retained heap.",
      "- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.",
      "- `wide`/`deep`/`param-scaling` are scaling sweeps — the per-size *curve* matters (here wide/param are flat for all; deep separates real-router O(depth) from @solidjs/router flat).",
      "- **Elevated RME on the close per-nav scenarios (n=10)** — `active-links`, `param-nav`, `nested-switch` per-nav `script` medians carry RME ~15–23% because Solid's per-nav work is sub-0.1 ms (near timer granularity → inflated *relative* variance). Their conclusion is 'all three ~tight' precisely because the differences sit inside that noise; the headline findings (cold-start heap, wide/deep/param sweeps, table-heap, nav-latency total) rest on stable, larger-magnitude signals (RME < ~5%).",
    ],
  },
};

const cfg = FW[FRAMEWORK];
if (!cfg) {
  console.error(`Unknown framework '${FRAMEWORK}'. Known: ${Object.keys(FW).join(", ")}`);
  process.exit(1);
}
const ENGINES = cfg.engines;

function read(scenario, engine) {
  const path = `${RESULTS}/${scenario}/${engine}.json`;
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

function fmt(value) {
  if (value == null) return "—";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function metaLine() {
  for (const scenario of SCENARIOS) {
    for (const engine of ENGINES) {
      const data = read(scenario.id, engine);
      if (data) return `runs ${data.runs} · warmup ${data.warmup} · throttle ${data.throttle} · ${data.env?.date ?? "?"}`;
    }
  }
  return "(no results yet)";
}

const lines = [];
lines.push(`# Cross-Router Performance — ${cfg.cohortName}`);
lines.push("");
lines.push("> Real-browser (Chromium + CDP) benchmarks of **routers compared within one framework**. Engine-agnostic Playwright drivers run the same `data-testid` interactions against every engine; only the routing layer differs. **Per-cohort only — we do NOT rank across frameworks** (a cross-framework number is mostly a framework comparison, not a router one).");
lines.push("");
lines.push(cfg.cohortLine);
lines.push("");
lines.push(cfg.scopeNote);
lines.push("");
lines.push(`**Run:** ${metaLine()} · Apple M3 Pro · numbers are **median** (winner per row **bold**).`);
lines.push("");
lines.push(cfg.warningLine);
lines.push("");

for (const scenario of SCENARIOS) {
  const blurb = cfg.blurbs[scenario.id];
  if (!blurb) continue;
  lines.push(`## ${scenario.title} — \`${scenario.id}\``);
  lines.push("");
  lines.push(blurb);
  lines.push("");
  lines.push(`| metric | ${ENGINES.join(" | ")} |`);
  lines.push(`|---|${ENGINES.map(() => "---").join("|")}|`);
  for (const [key, label, unit, dir] of scenario.rows) {
    const values = ENGINES.map((engine) => read(scenario.id, engine)?.metrics?.[key]?.median ?? null);
    const present = values.filter((v) => v != null);
    const best = present.length === 0 ? null : dir === "higher" ? Math.max(...present) : Math.min(...present);
    const cells = values.map((v) => (v == null ? "—" : v === best ? `**${fmt(v)}**` : fmt(v)));
    lines.push(`| ${label} (${unit}) | ${cells.join(" | ")} |`);
  }
  lines.push("");
}

lines.push("## Feature support — capability, NOT a perf race");
lines.push("");
lines.push(cfg.capabilityIntro);
lines.push("");
lines.push(`| capability | ${ENGINES.join(" | ")} |`);
lines.push(`|---|${ENGINES.map(() => "---").join("|")}|`);
for (const cap of cfg.capabilities) {
  const cells = ENGINES.map((engine) => {
    const support = cap.support[engine];
    if (support === "✓" && cap.key && FEATURES[cap.key]?.[engine] === "verified") return "✓ⁱ";
    return support;
  });
  lines.push(`| ${cap.feature} | ${cells.join(" | ")} |`);
}
lines.push("");
lines.push(cfg.capabilityLegend);
lines.push("");
lines.push(cfg.capabilityReading);
lines.push("");
for (const cap of cfg.capabilities) lines.push(`- **${cap.feature}** — ${cap.basis}`);
lines.push("");

const BASELINE_ROWS = [
  { scenario: "cold-start", metric: "scriptDurationMs", label: "cold-start script (ms)" },
  { scenario: "cold-start", metric: "jsHeapMB", label: "cold-start heap (MB)" },
  { scenario: "nav-latency", metric: "scriptDurationMs", label: "nav script (ms)" },
  { scenario: "link-build", metric: "scriptMs", label: "link-build script (ms)" },
];
if (read("cold-start", "_baseline")) {
  lines.push(`## Router overhead over ${cfg.baselineLabel} (\`_baseline\`)`);
  lines.push("");
  lines.push(cfg.baselineNote);
  lines.push("");
  lines.push(`| metric | ${cfg.baselineLabel} | ${ENGINES.join(" | ")} |`);
  lines.push(`|---|---|${ENGINES.map(() => "---").join("|")}|`);
  for (const row of BASELINE_ROWS) {
    const base = read(row.scenario, "_baseline")?.metrics?.[row.metric]?.median;
    if (base == null) continue;
    const cells = ENGINES.map((engine) => {
      const v = read(row.scenario, engine)?.metrics?.[row.metric]?.median;
      if (v == null) return "—";
      const d = v - base;
      return `${fmt(v)} (${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)})`;
    });
    lines.push(`| ${row.label} | ${fmt(base)} | ${cells.join(" | ")} |`);
  }
  lines.push("");
  lines.push(cfg.baselineReading);
  lines.push("");
}

lines.push("## What this does NOT measure / caveats");
lines.push("");
for (const c of cfg.caveats) lines.push(c);
lines.push("");
lines.push(`Regenerate: \`node cross-router/run-all.mjs && node cross-router/harness/report.mjs ${FRAMEWORK}\`.`);
lines.push("");

const outFile = FRAMEWORK === "react" ? "REPORT.md" : `REPORT-${FRAMEWORK}.md`;
writeFileSync(`${here}/${outFile}`, `${lines.join("\n")}\n`);
console.log(`Wrote ${here}/${outFile}`);
