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
  { id: "nav-latency", title: "Navigation — per-nav total main-thread (script + history)", rows: [["totalMs", "≈ total main-thread", "ms", "lower"], ["scriptDurationMs", "· script (V8 only)", "ms", "lower"], ["blinkMs", "· Blink history (pushState)", "ms", "lower"], ["allocKBPerNav", "alloc / nav (GC pressure)", "KB", "lower"]] },
  { id: "param-nav", title: "Param navigation — per-nav total (script + history)", rows: [["totalMs", "≈ total main-thread", "ms", "lower"], ["scriptDurationMs", "· script (V8 only)", "ms", "lower"], ["blinkMs", "· Blink history (pushState)", "ms", "lower"], ["allocKBPerNav", "alloc / nav (GC pressure)", "KB", "lower"]] },
  { id: "wide-config", title: "Wide config — matcher breadth (sweep)", rows: [["totalMs@10", "≈ total @10", "ms", "lower"], ["totalMs@100", "≈ total @100", "ms", "lower"], ["totalMs@1000", "≈ total @1000", "ms", "lower"], ["scriptMs@10", "· script (matcher) @10", "ms", "lower"], ["scriptMs@100", "· script (matcher) @100", "ms", "lower"], ["scriptMs@1000", "· script (matcher) @1000", "ms", "lower"]] },
  { id: "table-heap", title: "Route-table memory — heap to hold N routes (sweep)", rows: [["jsHeapMB@1", "heap @1 (floor)", "MB", "lower"], ["jsHeapMB@1000", "heap @1k", "MB", "lower"], ["jsHeapMB@10000", "heap @10k", "MB", "lower"]] },
  { id: "deep-config", title: "Deep config — nesting depth (sweep)", rows: [["totalMs@3", "≈ total @3", "ms", "lower"], ["totalMs@30", "≈ total @30", "ms", "lower"], ["totalMs@60", "≈ total @60", "ms", "lower"], ["totalMs@90", "≈ total @90", "ms", "lower"], ["scriptMs@3", "· script (matcher) @3", "ms", "lower"], ["scriptMs@30", "· script (matcher) @30", "ms", "lower"], ["scriptMs@60", "· script (matcher) @60", "ms", "lower"], ["scriptMs@90", "· script (matcher) @90", "ms", "lower"]] },
  { id: "search-param-scaling", title: "Search-param scaling — query-param count (sweep, reads all values)", rows: [["totalMs@1", "≈ total @1", "ms", "lower"], ["totalMs@10", "≈ total @10", "ms", "lower"], ["totalMs@50", "≈ total @50", "ms", "lower"], ["scriptMs@1", "· script (query-parse) @1", "ms", "lower"], ["scriptMs@10", "· script (query-parse) @10", "ms", "lower"], ["scriptMs@50", "· script (query-parse) @50", "ms", "lower"], ["allocKBPerNav", "alloc / nav @50↔@1 (GC pressure)", "KB", "lower"]] },
  { id: "nav-churn", title: "Nav churn (stress)", rows: [["totalMsPerNav", "≈ total / nav", "ms", "lower"], ["scriptMsPerNav", "· script / nav (V8)", "ms", "lower"], ["blinkMsPerNav", "· Blink / nav (pushState)", "ms", "lower"], ["heapDeltaKB", "heap retained (200 navs)", "KB", "lower"], ["navsPerSec", "throughput (frame-capped)", "/s", "higher"]] },
  { id: "active-links", title: "Active links (100) — per-nav total (script + history)", rows: [["totalMs", "≈ total main-thread", "ms", "lower"], ["scriptDurationMs", "· script (V8 only)", "ms", "lower"], ["blinkMs", "· Blink history (pushState)", "ms", "lower"]] },
  { id: "link-build", title: "Link build — mount 1000 links (href construction)", rows: [["scriptMs", "script (1000 links)", "ms", "lower"]] },
  { id: "nested-switch", title: "Nested switch (reuse) — per-nav total (script + history)", rows: [["totalMs", "≈ total main-thread", "ms", "lower"], ["scriptDurationMs", "· script (V8 only)", "ms", "lower"], ["blinkMs", "· Blink history (pushState)", "ms", "lower"]] },
];

const REACT_BLURBS = {
  "cold-start": "App init + parse/exec to first route painted (small route table).",
  "nav-latency": "Per-navigation **total main-thread** (script + Blink history, both harness-measured). **real-router is the lightest — 0.52 ms/nav total**, below react-router (0.68) and tanstack (0.70), winning *both* components (script 0.40 and Blink history 0.11 — lowest of the three). Unlike the Vue cohort (where vue-router's 2×-`pushState` brings it to parity), all React routers hit history ~1×/nav, so real-router's lean script carries straight through to a clear total win. (15 runs; `total` = `script` (V8/`ScriptDuration`) + Blink `updateForSameDocumentNavigation`.) **`alloc/nav` (GC pressure): real-router is the leanest allocator too — ~0.12 KB/nav** vs react-router 0.15, tanstack ~0.77 (~6×); its compact immutable State allocates little per nav where tanstack's per-nav pipeline produces garbage.",
  "param-nav": "Per-nav total changing :id (steady-state sweep /users/1→2→3…). **real-router lightest — 0.55 ms total** vs tanstack 0.73 / react-router 0.70 (lowest script; Blink ~equal). `alloc/nav` (GC pressure): real-router's immutable State references the new `:id` value rather than re-copying, so per-nav allocation stays low — read alongside the CPU rows.",
  "wide-config": "Navigate into a flat 1000-route table; per size **total** (script + Blink) + **script** (matcher). Flat curve = O(1)/trie, rising = O(N)/scan. **real-router stays flat and wins every size** (~0.50 total); tanstack flat-higher (~0.9); react-router degrades @1000 (0.80 → 1.50, O(N)). The matcher win holds on total, not just script.",
  "table-heap": "Retained JS heap holding a table of 1 / 1000 / 10000 routes (forced GC; @1 ≈ the React/app floor). The memory counterpart to wide-config. real-router's segment trie *historically* cost the most here — but heap-profiling traced the bulk to **empty per-route collections + redundant indexes, not the trie itself**, and **#1009 + #1010 removed them** (shared frozen sentinels, a monomorphic `CompiledRoute`, and dropping two duplicate `name→route` maps). At 10k real-router went from **heaviest (~1.85×) to the lightest** of the three (~0.63 KB/route, just under react-router) while keeping the flat O(1) match — the benchmark drove a real core optimization. The trie's genuine space-for-time cost turned out small; the rest was fixable slack. heap is the most stable signal (RME < 0.01%).",
  "deep-config": "Navigate into a 90-level nested chain (sweep 3 / 30 / 60 / 90). **real-router and tanstack scale cleanly and monotonically** — real-router is lowest at every realistic depth. **react-router's curve is a parabola** (fine-grained: rises to ~6 ms near depth 45–60 — ~4× real-router — then declines back to ~1.7 ms at depth 90; the 60→90 drop is the parabola's right tail, not a threshold). Root cause (CPU-profiled + confirmed in react-router source): `matchRoutes` tries route branches **deepest-first** (`computeScore` ranks more segments higher) and re-matches every *deeper* branch before reaching the target — so depth D wastes `O((maxDepth−D)×D)` path re-normalization (`matchRouteBranch`/`joinPaths`/`removeDoubleSlashes`) on branches that fail; maximal mid-depth, zero only when the target *is* the deepest route. real-router walks its precompiled segment trie straight to the match (O(depth), no branch-retrying, no per-nav string normalization) — hence the clean low curve. Real apps rarely nest past ~10, where real-router wins outright regardless. (Table is total@D + script@D; the matcher/parabola story lives in `script`; on total real-router edges @90 too.)",
  "search-param-scaling": "Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`) — the realistic high-count vector (marketplace filters / analytics / tracking; path params top out at ~4). The leaf reads EVERY value, so lazy query is materialized (apples-to-apples). **real-router stays FLAT (~0.62 ms, slope ~0) and wins @50** — its eager immutable params make reading all 50 a cheap property access. **tanstack EXPLODES — 2.60 ms @50 (~4× real-router), slope ~22 µs/param**: its per-nav search parse + validate + structural-share pipeline is O(query-count). react-router is flat too (0.79 @50 — `URLSearchParams` is a cheap plain object) but a higher floor. At realistic marketplace query counts real-router's flat curve is the win — the eager snapshot never degrades. **`alloc/nav` (GC pressure, @50↔@1 toggle) tells the SAME story in memory:** real-router allocates ~0.13 KB/nav **flat** — its eager params *reference* the browser's URL-parsed strings instead of copying — while tanstack's parse/validate/structural-share nearly **doubles** its allocation at 50 params (~1.4 KB/nav, **~11× real-router**). So the eager model wins **both** axes at high count — flat CPU *and* flat allocation — refuting the intuition that an eager snapshot must produce more garbage; it's actually the *leanest* allocator.",
  "nav-churn": "200-nav stress; per-nav total (script + Blink) + heap. **real-router lightest CPU/nav (0.94 total)**, tanstack 1.15, react-router 1.29 — **and retains the least heap (704 KB)** (react-router 883, tanstack 1214). navsPerSec frame-capped — read CPU/nav + heap.",
  "active-links": "Per-nav total recompute across 100 links (steady-state toggle). **real-router lightest by a wide margin — 0.81 ms vs tanstack 1.44 / react-router 1.73 (~2× lighter)**: a shared cached active-source recomputes all 100 links off **one** `router.subscribe`, where react-router / tanstack pay per-link active machinery. Blink ~equal. **This is a cross-cohort strength — real-router leads or ties active-links in every cohort** (Svelte + Angular wins below; near-parity vs already-lean Solid / Vue).",
  "link-build": "CPU to mount 1000 `<Link>`s at once — each builds its href via the router's reverse-matcher (`buildPath` / `generatePath` / `buildLocation`), isolated from route construction (done once at startup). A real cost for link-heavy pages (nav menus, sitemaps, paginated lists). **real-router leanest (7.57 ms) — its `<Link>` active state now resolves through a shared per-router active-name selector (one `router.subscribe` for all links, not a subscription per link), which cut ~1.6 ms off the mount**; react-router 9.70 (real-router leads by ~2 ms now), tanstack ~1.9× slower (14.4).",
  "nested-switch": "Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **real-router lightest — 0.62 ms total** vs react-router 0.82 / tanstack 0.85.",
};


const VUE_BLURBS = {
  "cold-start": "App init + parse/exec to first route painted. vue-router is the lightest to boot, real-router middle, tanstack heaviest.",
  "nav-latency": "Per-navigation main-thread script, **steady-state** (N navs ÷ N, each fully completing before the next — so async routers' deferred work *is* counted; this is a fair total, not a sync-vs-async artifact). **vue-router is exceptionally lean (~0.043 ms/nav — the lightest router in any cohort here):** Vue's fine-grained reactivity turns a route change into a minimal reactive-ref update + `<RouterView>` swap. real-router (~0.18) and tanstack (~0.17) are ~4× heavier **in `script`** — but that ratio is **`ScriptDuration` (V8-only)** and excludes Blink C++. A CDP **trace** shows the dominant per-nav cost is Blink's `updateForSameDocumentNavigation` (the `history.pushState` work), which **vue-router triggers 2×/nav** (`replaceState`+`pushState`) vs real-router **1×**. Counting it, **all three are at PARITY — ~0.32 ms/nav (within ~3%): real-router 0.317 ≈ vue-router 0.327 ≈ tanstack 0.314** (15 runs). vue-router's ~4× lean script (0.037) is *exactly* offset by its 2× Blink history (0.30 vs real-router's 0.18); real-router is balanced (script 0.15 + Blink 0.18). So '4× lighter vue-router nav' is a `ScriptDuration` artifact — fairly counted, the three are equal. The harness now reports total + script + Blink (this is reproducible, not hand-recorded). (Blink is CDP-traced — per-call absolute noisy ~0.06–0.13 ms, but the count 2× vs 1× is exact from each router's source.) real-router's small residual script edge is navigate render/emit — **not** the adapter (a lean native-`computed` Link does not close it), **not** history, **not** the core (pure-Node 0.79 µs, lighter than vue-router). real-router's Vue nav is fast absolutely — under one frame, below its own React number (~0.38).",
  "param-nav": "Per-nav total changing :id (steady-state sweep). **vue-router lightest (0.38), tanstack 0.43, real-router 0.48 (~1.26×)** — the script-only ~5× shrinks to ~1.3× in total (vue-router's 2× Blink).",
  "wide-config": "Navigate into a flat 1000-route table — **the matcher crossover.** vue-router is lightest at small N (lean Vue floor: ~0.16 total @10/@100) but **degrades @1000 to 0.434** (O(N) matcher); **real-router stays flat (~0.24) and WINS @1000** — 0.240 < vue-router 0.434, tanstack 0.293 — on **total**, not just script (0.177 vs 0.350). The trie's structural win at scale survives the honest metric.",
  "table-heap": "Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **real-router is the lightest at 10k (~0.64 KB/route — the #1009/#1010-optimized trie)**, beating vue-router (~1.19 KB/route) and tanstack (~0.90). At scale real-router wins both CPU (wide) and memory.",
  "deep-config": "Navigate into a 90-level nested chain; **total** + **script** (matcher). **real-router and vue-router stay flat** (real-router ~0.30 total; vue-router ~0.18 — its leaner per-nav floor); **tanstack rises O(depth)** (0.38 → 1.17, ~3× by @90). Both full pipelines stay flat — matcher/composition doesn't degrade; tanstack's deep-nav cost grows. Real apps rarely nest past ~10.",
  "search-param-scaling": "Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`, the realistic high-count vector), reading every value. **vue-router lightest and FLAT (~0.19 @50)** — `route.query` is a plain reactive object, cheap to read at any count. **real-router is also flat (~0.32 @50, slope ~0)** — eager immutable params. **tanstack rises steeply — 1.10 ms @50 (slope ~15 µs/param)**, its O(count) search parse/validate/structural-share pipeline. So on query params vue-router's plain-object query edges real-router's flat curve, and tanstack degrades at scale. **`alloc/nav`** (GC-pressure axis): real-router's eager params reference URL-parsed strings, so per-nav allocation stays **flat** with query count — the memory counterpart to its flat `script` curve (react-cohort probe: real-router the leanest allocator; parse/validate pipelines allocate O(count) garbage).",
  "nav-churn": "200-nav stress; per-nav total (script + Blink) + heap. **vue-router lightest CPU/nav (0.50 total)**, tanstack 0.53, real-router 0.63; **real-router retains the least heap (510 ≈ vue-router 519; tanstack ~2× at 1079)**. navsPerSec frame-capped — read CPU/nav + heap.",
  "active-links": "Per-nav total recompute across 100 links (steady-state toggle). **All three near-parity — real-router / vue-router / tanstack cluster ~0.37–0.49 ms**, and the ranking is within run-to-run noise (real-router led one run at 0.37, tanstack another at 0.39 — a ~0.05 ms sub-metric spread). No stable winner here: unlike React/Svelte/Angular (where competitors pay heavier per-link active machinery), Vue's fine-grained reactivity is already lean enough that real-router's shared active-source doesn't separate from it.",
  "link-build": "CPU to mount 1000 links, each building its href (real-router `buildPath` · vue-router `resolve` · tanstack build). **All three tiny (~0.19–0.26 ms) — tanstack (0.19) and vue-router (0.20) leanest; real-router 3rd (~0.26 ≈ the bare-Vue floor 0.27)**: Vue's link-build isn't subscription-bound, so real-router's shared active-name selector (which wins React's link-build) adds nothing to move over an already-floor number. Sub-0.3 ms for all — not a link-heavy differentiator in this cohort.",
  "nested-switch": "Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **vue-router lightest (0.23), tanstack 0.34, real-router 0.45 (~1.9×)**.",
};

const SOLID_BLURBS = {
  "cold-start": "App init + parse/exec to first route painted. **@solidjs/router is the lightest to boot** (heap 2.48 MB, script 2.80 ms); real-router middle (2.78 / 4.54), tanstack heaviest (3.09 / 4.12). Over the bare-Solid floor (2.29 MB heap / 0.88 ms) all three add little.",
  "nav-latency": "Per-navigation total (script + Blink history), steady-state. **real-router is the leanest per-nav total — 0.347 ms** (< tanstack 0.417 < @solidjs/router 0.520), and it now leads on *every* component: script (0.061, the lowest of the three) and Blink history (0.283, tied-lowest). Unlike the Vue cohort (vue-router leanest), here real-router owns the lightest per-nav outright.",
  "param-nav": "Per-nav total changing :id (steady-state). **real-router leanest total (0.345)** vs tanstack 0.367, @solidjs/router 0.492 — @solidjs/router's ~1.5× leaner script (0.048 vs rr 0.070) is *more* than offset by its 2× Blink history (0.444 vs rr 0.282), so on the honest total real-router wins.",
  "wide-config": "Navigate into a flat 1000-route table. **All three matchers are FLAT** (no O(N) degradation): @solidjs/router total ~0.16, tanstack ~0.24, real-router ~0.38 across @10/@100/@1000. The differentiator is the per-nav FLOOR, not matcher scaling — **@solidjs/router's minimal pipeline is the leanest floor; real-router's full pipeline (transition + browser-plugin History) is the heaviest**, but flat. (Contrast React/Vue, where a competitor's matcher degrades O(N) and real-router's trie wins @1000 — here no competitor degrades, so the trie's structural edge doesn't separate them.)",
  "deep-config": "Navigate into a 90-level nested chain. **@solidjs/router stays flat (~0.16 total); real-router rises ~linearly — 0.47 → 1.07 ms @90** (script 0.41 → 1.01). The steep O(d²) rise seen in earlier runs was a **bench-app artifact** (an O(depth²) lazy-getter chain, since fixed) — the residual ~linear cost is **`@real-router/solid`'s `RouteView` per-level composition (#1094)**, not the core matcher (the Vue adapter keeps deep-nav flat at ~0.20 ms @90). **@tanstack/solid-router is N/A** — it triggers its internal error boundary on 60+-segment deep routes (the @tanstack/react-router equivalent renders depth 90). Real apps rarely nest past ~10, where the gap is ~0.3 ms.",
  "search-param-scaling": "Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`, the realistic high-count vector), reading every value — and **this is where forcing materialization bites the lazy routers.** **real-router stays FLAT (~0.49 @50, slope ~0)** — eager immutable params. **@solidjs/router RISES — slope ~5.5 µs/param**: its `useSearchParams()` reactive store charges a reactive read per value, so @1 it crushes real-router (0.18 vs 0.49) but by @50 they **CONVERGE (0.46 ≈ 0.49)**. tanstack also rises (~3.6 µs/param). At the realistic high-count end the lazy advantage erodes to parity — real-router's eager snapshot is the flat, predictable cost (read once, cheap forever). **`alloc/nav`** (GC-pressure axis): real-router's eager params reference URL-parsed strings, so per-nav allocation stays **flat** with query count — the memory counterpart to the flat `script` curve (react-cohort probe: real-router the leanest allocator; parse/validate pipelines allocate O(count) garbage).",
  "table-heap": "Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **@solidjs/router lightest at 10k (5.61 MB); real-router 8.27; tanstack heaviest (10.66).** Unlike the React/Vue cohorts (real-router's trie wins memory), @solidjs/router's minimal route storage is leaner here.",
  "nav-churn": "200-nav stress; CPU/nav + retained heap. **real-router leanest CPU/nav — 0.35 total / 0.064 script per nav** (< tanstack 0.459 < @solidjs/router 0.534); **@solidjs/router retains the least heap (235 KB), real-router 299, tanstack 638.** `navsPerSec` is NOT comparable here: real-router navigates synchronously (churns 200 navs without yielding to frames → ~15k/s) while @solidjs/router + tanstack defer to the frame cadence (~121/s) — read CPU/nav + heap.",
  "active-links": "Per-nav total recompute across 100 links (steady-state toggle). **All three tight — tanstack 0.351 < real-router 0.369 < @solidjs/router 0.446** (~1.3× spread, unlike React/Svelte/Angular's wide spread). @solidjs/router's `<A>` is inherently active-aware and Solid's fine-grained reactivity is already lean, so real-router's shared cached active-source ties rather than wins here — near-parity, not a loss.",
  "link-build": "CPU to mount 1000 links, each building its href. **real-router leanest (8.82 ms); @solidjs/router 9.93; tanstack ~3× (26.5).** Over the bare-`<a>` floor (1.9 ms) real-router adds the least reverse-matcher cost.",
  "nested-switch": "Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **real-router leanest total (0.357), tanstack 0.361, @solidjs/router 0.497** — real-router edges tanstack on the honest total (a per-nav-render metric it now leads, cf. nav-latency / param-nav).",
};

const SVELTE_BLURBS = {
  "cold-start": "App init + parse/exec to first route painted. **sv-router is the lightest to boot** (heap 2.54 MB, script 3.79 ms); mateo-router 2.61 / 4.22; real-router heaviest (2.98 / 5.13). Over the bare-Svelte floor (2.39 MB / 2.17 ms) real-router adds the most boot cost.",
  "nav-latency": "Per-navigation total (script + Blink history), steady-state. **sv-router is the leanest per-nav — 0.358 ms** (script 0.163 ≈ the bare-Svelte floor 0.166); real-router 0.489, mateo-router 0.499. sv-router's minimal pipeline sits essentially at the no-router floor.",
  "param-nav": "Per-nav total changing :id (steady-state). **sv-router leanest (0.272); real-router 0.418; mateo-router 0.451.**",
  "wide-config": "Navigate into a flat 1000-route table — **the matcher crossover, and real-router's clearest win in this cohort.** real-router's segment trie stays FLAT (total ~0.44 across @10/@100/@1000; script 0.371 @1000), while **sv-router degrades O(N)** (0.328 → 0.796 @1000 — it sorts + scans its route-key list per nav) and mateo-router carries a high flat floor (~0.89). **real-router WINS @1000** (0.442 < sv-router 0.796 < mateo 0.888) on total — the structural trie advantage holds in Svelte (as in React/Vue, unlike the Solid cohort where @solidjs/router was also flat).",
  "deep-config": "Navigate into a 90-level nested chain. **All three rise O(depth)** — real-router steepest (0.65 → 4.95 total, script 4.87 @90), sv-router leanest (2.94 @90), mateo-router 4.22. **Read this curve as directional:** #1094's Solid research found the analogous deep rise was ~60% a *Solid-specific* benchmark-app artifact (O(d²) lazy-prop construction) plus real adapter bugs — the Svelte deep cost has **not** been decomposed the same way, so the split between app-structure and `@real-router/svelte` `RouteView` composition here is open (the core matcher is flat-capable — cf. the Vue adapter's flat 0.24 @90). **mateo-router renders depth 90 fine** — unlike `@tanstack/solid-router`, which errored past ~30 in the Solid cohort. Real apps rarely nest past ~10.",
  "search-param-scaling": "Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`, the realistic high-count vector), reading every value. **real-router is FLAT (~0.46 @50, slope ~0)** — eager immutable params — and **WINS @50 (0.461 vs sv-router 0.483, mateo-router 0.710)**: sv-router leads at @1 (its lazy reactive `route.search` is cheap for few params) but RISES with count and real-router's flat eager curve overtakes it by @50; mateo-router rises steepest. Reading all values at the realistic high-count end is exactly where eager materialization beats per-read reactive query. **`alloc/nav`** (GC-pressure axis): real-router's eager params reference URL-parsed strings, so per-nav allocation stays **flat** with query count — the memory counterpart to its flat `script` curve (react-cohort probe: real-router the leanest allocator; parse/validate pipelines allocate O(count) garbage).",
  "table-heap": "Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **sv-router wins decisively — 2.26 MB @10k** (its route table is a plain object map), vs real-router 8.38 and mateo-router 9.20 (heaviest). Unlike the React/Vue cohorts where real-router's trie was the memory winner, sv-router's minimal storage is far leaner here.",
  "nav-churn": "200-nav stress; CPU/nav + retained heap. **sv-router leanest — CPU/nav 0.53, retained heap 243 KB**; mateo-router 0.78 / 295 KB; real-router 0.82 / 380 KB (heaviest here). `navsPerSec` is ~121 for all three (frame-capped in this cohort — read CPU/nav + heap).",
  "active-links": "Per-nav total recompute across 100 links (steady-state toggle). **real-router WINS — 0.553** (its shared cached active-source, one `router.subscribe`) vs sv-router 0.642 and mateo-router 0.739 (per-link `isActiveLink` attachment recompute). A clear per-nav win — and part of real-router's cross-cohort active-links lead (React / Angular win too).",
  "link-build": "CPU to mount 1000 links, each building its href. **sv-router leanest (3.23 ms ≈ the bare-`<a>` floor 3.03) — plain `<a href>` intercepted by a global click handler, no per-link component**; mateo-router 7.02; **real-router heaviest (12.0 ms)** — after #1101's shared active-name selector removed the per-link subscription, the residual is `@real-router/svelte`'s `<Link>` running `buildPath` per link + per-component instantiation; sv-router avoids both with a literal `<a href>` (`buildPath` is inherent — React/Solid/Angular rr pay it and win their link-build).",
  "nested-switch": "Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **sv-router leanest (0.347); mateo-router 0.442; real-router 0.501.**",
};

const ANGULAR_BLURBS = {
  "cold-start": "App init + parse/exec to first route painted. **@angular/router boots far lighter — script 2.07 ms** (heap 3.28) vs real-router 6.05 / 3.51 (~3× the boot script). Bare-Angular floor is 1.77 ms / 2.80 MB, so `@real-router/angular` adds ~4.3 ms of startup. **Decomposed (#1106, isolation ladder): the excess is CORE, not the adapter** — ~57% is parse+eval of the full `@real-router/core` bundle, ~28% is `createRouter`+`start()` (a warm re-run showed ~90% of *that* is one-time V8 cold-JIT, not initialization *work* — the trie of a small table is trivial); `provideRealRouter` DI (~0.04 ms) and `RouteView` (~0.64 ms) are cheap. So the boot delta is a **code-size-driven one-time cost** (parse + cold-JIT ≈ 11.5 µs/KB on M3) — the price of shipping the full pipeline; competitors' lightness ∝ their smaller / tree-shaken code (`@angular/router`'s `provideRouter` adds ~0.4 ms). Cross-cohort-consistent (~4.5–7 ms across solid/svelte/angular). #1106 tracks it (post-1.0 RFC-candidate; desktop ROI low, SSR/SSG amortizes boot).",
  "nav-latency": "Per-navigation total (script + Blink), steady-state. **@angular/router leanest — 0.523 ms** (script 0.237) vs real-router 0.831 (0.561). (The bare-Angular baseline's manual `(click)`→`pushState`→signal path is not cheaper than either router here; read the two routers against each other — and note this scenario's per-nav `script` is timer-granular, see caveats.)",
  "param-nav": "Per-nav total changing :id (steady-state). **@angular/router leanest (0.362); real-router 0.446.**",
  "wide-config": "Navigate into a flat 1000-route table. **Both matchers are FLAT** (no O(N) degradation) — but **@angular/router is leaner** (total ~0.33 across @10/@100/@1000) than real-router (~0.49). Unlike the Svelte cohort (where sv-router degraded O(N) and real-router's trie won @1000), `@angular/router`'s route matcher is both flat AND a lighter floor — **real-router's segment trie does not win scale here.** Angular's official router is a well-optimized matcher.",
  "deep-config": "Navigate into a 90-level nested chain. Both rise O(depth); real-router edges it at the deep end (script 4.66 ms @90 vs @angular/router 5.34). **Directional:** #1094's Solid research showed the analogous rise there was ~60% a Solid-specific bench-app artifact + adapter bugs (the adapter fix is Solid-only, `packages/solid`); the Angular deep cost has not been decomposed the same way. Real apps rarely nest past ~10.",
  "search-param-scaling": "Navigate into routes with 1 / 10 / 50 **query** params (`/sN?k1=v1&…`, the realistic high-count vector), reading every value. **real-router edges @50 (0.597 vs 0.607)** — both stay near-flat (real-router eager params; @angular/router reads `snapshot.queryParams`, a plain object). Unlike the reactive-store cohorts (Solid `useSearchParams`, Svelte `route.search`) or tanstack (whose search pipeline explodes ~15–22 µs/param), **neither Angular router degrades on query count** — real-router's flat eager curve holds the realistic high-count end. **`alloc/nav`** (GC-pressure axis): real-router's eager params reference URL-parsed strings, so per-nav allocation stays **flat** with query count — the memory counterpart to its flat `script` curve (react-cohort probe: real-router the leanest allocator; parse/validate pipelines allocate O(count) garbage).",
  "table-heap": "Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **@angular/router far lighter — 3.67 MB @10k** vs real-router 8.72. real-router's segment-trie route storage is the heavier structure; and unlike the React/Vue cohorts it does NOT buy a matcher-scale win here (@angular/router is also flat @1000) — the trie's space cost without the usual space-for-time payoff in this cohort.",
  "nav-churn": "200-nav stress; CPU/nav + retained heap. **@angular/router leaner CPU/nav (0.59 vs real-router 0.99) but retains MORE heap (1035 KB vs 549).** navsPerSec ~121 for both (frame-capped) — read CPU/nav + heap.",
  "active-links": "Per-nav total recompute across 100 links (steady-state toggle). **real-router WINS — 0.586** (script 0.264) vs @angular/router 1.058 (0.755, ~2× heavier). real-router's shared cached active-source (one `router.subscribe`) beats `@angular/router`'s per-link `routerLinkActive` router-event subscription. real-router's clearest win in this cohort — and part of its cross-cohort active-links lead (React + Svelte win too).",
  "link-build": "CPU to mount 1000 links, each building its href. **real-router leaner — 12.72 ms** vs @angular/router 17.69, though both are heavy over the bare-`<a>` floor (5.32). real-router's `RealLink` runs the reverse-matcher (`buildPath`); `@angular/router`'s `routerLink` serializes a URL tree (config-independent) — different mechanisms, both costly. (`RealLink`'s active state already uses the shared active-name selector fast path (#1104); the residual is `buildPath` per link + directive/effect setup, not a per-link subscription.)",
  "nested-switch": "Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **@angular/router leaner (0.341); real-router 0.496.**",
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
    scopeNote: "**Scope — three full routers, like-for-like** (no minimalist exclusion needed). The honest picture, DIFFERENT from the React/Vue cohorts: **`@solidjs/router` is a remarkably lean router** and leads the scale floor (wide), table-heap memory, cold-start, nav-churn heap, and active-links. **real-router leads the per-nav *totals*** — nav-latency (0.347, the leanest here), param-nav, nested-switch, link-build — where its lean script + single `pushState` beat @solidjs/router's 2× Blink history; and it brings the full pipeline (guards, validated search, data, scroll). Two adapter soft-spots surface: real-router's heaviest per-nav FLOOR at scale (transition pipeline + browser-plugin History), and **`@real-router/solid`'s deep-nesting `RouteView` cost (#1094 — now ~linear after a bench-app fix removed an O(depth²) getter-chain artifact: 1.07 ms @90)** — an adapter issue, not the (framework-agnostic, flat-capable) core. **`@tanstack/solid-router` is generally heaviest** and cannot render 60+-deep nested routes (errors).",
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
      "- `wide`/`deep` are scaling sweeps — the per-size *curve* matters (here wide is flat for all; deep separates real-router O(depth) from @solidjs/router flat).",
      "- **Per-nav `script` medians sit near timer granularity** (Solid's per-nav work is sub-0.1 ms → inflated *relative* variance). At n=15 they are within the RME gate except one — `@solidjs/router` `nav-latency` `scriptDurationMs` (16.3%). The close per-nav *totals* (active-links, nested-switch) turn on differences inside that noise; the headline findings (cold-start heap, wide/deep sweeps, table-heap, nav-latency total) rest on stable, larger-magnitude signals (RME < ~5%).",
    ],
  },
  svelte: {
    cohortName: "Svelte cohort",
    engines: ["real-router", "sv-router", "mateo-router"],
    blurbs: SVELTE_BLURBS,
    baselineLabel: "bare Svelte",
    warningLine: "⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the stable signals — CPU (`script`), heap, FCP. Felt latency was dropped (render/frame-bound). `nav-churn` navsPerSec is frame-capped here (read CPU/nav + heap). **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++ (`history.pushState` ~identical across routers), so `script` ratios overstate the `total` per-nav gap.",
    cohortLine: "**Cohort:** `@real-router/svelte` · `sv-router` (community Svelte-5-first full router) · `@mateothegreat/svelte5-router` — Svelte 5 SFC apps (`vite-plugin-svelte`, `dedupe: ['svelte']`). **No `@tanstack/svelte-router` exists** (npm 404), so this cohort has no TanStack column; the popular `svelte-spa-router` (hash + regex) and `svelte-routing` are minimalist-class and excluded like `wouter`, and SvelteKit is framework-bundled (not a standalone router).",
    scopeNote: "**Scope — three full routers, like-for-like** (SvelteKit + hash/minimalist routers excluded). The honest split has **two axes plus a capability axis**. **Matcher scale** (`wide-config`): **real-router wins** — its segment trie stays flat @1000 (0.44) while sv-router degrades O(N) (0.80) and mateo-router floors high (0.89); the structural trie win holds in Svelte (as in React/Vue). **Per-nav render + memory** (cold-start, nav-latency, param-nav, nav-churn, table-heap, nested-switch, link-build): **sv-router wins** — a remarkably lean router (heap @10k 2.26 MB vs real-router 8.38; link-build 3.2 ms vs 12.0). **Capability**: **real-router is the ONLY full-pipeline router** (guards + validated search + data + scroll); sv-router covers data + guard, mateo-router guard only. real-router's adapter soft-spots: deep-nesting `RouteView` O(depth) (#1094) and a heavy `<Link>` (link-build 12.0 ms — `buildPath` + per-component instantiation, the residual after #1101's shared-selector fix). mateo-router renders depth 90 (no error boundary, unlike `@tanstack/solid-router`).",
    capabilityIntro: "Among three full routers, first-class API coverage differs sharply. `✓` = built-in API, `N/A` = none (hand-rolled). real-router is the only one covering all four axes.",
    capabilities: [
      { feature: "Data on navigation (loader tied to route)", support: { "real-router": "✓", "sv-router": "✓", "mateo-router": "N/A" }, basis: "rr: `onEnter` + `lifecycle`/`preload` plugin · sv-router: `beforeLoad`/`afterLoad` hooks · @mateothegreat: hooks are guard-style (`pre`/`post` return boolean), no data-returning loader" },
      { feature: "Typed / validated search params (schema)", support: { "real-router": "✓", "sv-router": "N/A", "mateo-router": "N/A" }, basis: "rr: `searchSchema` (zod) · sv-router: reactive `searchParams` only (no schema) · @mateothegreat: raw querystring parsing (no schema)" },
      { feature: "Blocking guard (canDeactivate / unsaved-changes)", support: { "real-router": "✓", "sv-router": "✓", "mateo-router": "✓" }, basis: "rr: `canDeactivate` · sv-router: `blockNavigation` · @mateothegreat: `hooks.pre` (returns boolean)" },
      { feature: "Built-in scroll restoration", support: { "real-router": "✓", "sv-router": "N/A", "mateo-router": "N/A" }, basis: "rr: `<RouterProvider scrollRestoration>` · sv-router: `scrollToTop` only (no saved-position restore) · @mateothegreat: none" },
    ],
    capabilityLegend: "`✓` / `N/A` are API-verified against each router's surface (the in-harness `✓ⁱ` demo verification exists for the React cohort; `@real-router/svelte` shares that pipeline — in-harness `✓ⁱ` for svelte is a follow-up). `N/A` = feature-absence, not a speed loss.",
    capabilityReading: "**Reading:** **real-router is the only full-capability router** in this cohort (all four axes). sv-router covers data + guard but lacks validated search and scroll restoration; mateo-router is guard-only. sv-router's leanness in the perf tables partly reflects this smaller surface — perf and capability read together.",
    baselineNote: "`_baseline` is the same pages with **no router** — manual `$state` view + `history.pushState`, raw `<a>`. Subtract it and `+Δ` is each router's marginal cost.",
    baselineReading: "**Reading:** over bare Svelte, sv-router adds almost nothing on the hot path (nav-latency + link-build sit ~at the floor); real-router adds the most on boot and on links (its `<Link>` reverse-matcher). real-router's separation is the matcher-scale win (wide @1000) + the full capability set, not the simple hot path.",
    caveats: [
      "- **No cross-framework ranking** — each column is the same framework (Svelte); the delta is router work. (Do NOT compare to the React/Vue/Solid cohorts.)",
      "- **No `@tanstack/svelte-router`** — it does not exist (npm 404); the popular `svelte-spa-router` (hash + regex) and `svelte-routing` are minimalist-class (excluded like `wouter`), SvelteKit is framework-bundled. The cohort is real-router + the two community full routers that exist.",
      "- **Deep-nesting rises O(depth) (script 4.87 ms @90) — cause not yet decomposed for Svelte.** #1094's Solid research showed the analogous rise was ~60% a *Solid-specific* benchmark-app artifact (O(d²) lazy props) + adapter bugs (cache-key + subtree remount), reduced to ~1.1 ms @90 in prototype. The Svelte deep app was not analyzed the same way — treat the curve as directional pending a #1094-style decomposition. The core matcher is flat-capable (Vue 0.24 @90).",
      "- **`@real-router/svelte` `<Link>` is heavy** — link-build 12.0 ms for 1000 links (vs bare-`<a>` 3.0, sv-router 3.2). #1101's shared active-name selector already removed the per-link subscription (14.6 → 12.0); the residual is `buildPath` per link (inherent) + per-`<Link>`-component instantiation. sv-router avoids both via a literal `<a href>` + a global click handler.",
      "- **`mateo-router` renders depth 90** — no internal error boundary at deep nesting (contrast the Solid cohort's `@tanstack/solid-router`, which errored past ~30).",
      "- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.",
      "- `wide`/`deep` are scaling sweeps — the per-size *curve* matters (wide separates real-router flat-trie from sv-router O(N); deep separates the adapters' composition cost).",
      "- **Per-nav `nav-latency` `script` medians are near timer granularity** (`_baseline` and sv-router per-nav script is sub-0.2 ms → inflated *relative* variance); at n=15 they sit within the RME gate. The nav-latency *total* and the headline findings (wide/deep sweeps, table-heap, cold-start heap, link-build) rest on stable, larger-magnitude signals (RME < ~5%).",
    ],
  },
  angular: {
    cohortName: "Angular cohort",
    engines: ["real-router", "angular-router"],
    blurbs: ANGULAR_BLURBS,
    baselineLabel: "bare Angular",
    warningLine: "⚠️ Preliminary local numbers — directional, not a published verdict. Reported metrics are the stable signals — CPU (`script`), heap, FCP. Felt latency was dropped (render/frame-bound). `nav-churn` navsPerSec is frame-capped (read CPU/nav + heap). **Caveat — `script` is V8-only:** CDP `ScriptDuration` excludes Blink C++, so `script` ratios overstate the `total` per-nav gap. Angular 22 (zoneless), built via `@analogjs/vite-plugin-angular` (AOT).",
    cohortLine: "**Cohort:** `@real-router/angular` · `@angular/router` — Angular 22 zoneless standalone-component apps (`@analogjs/vite-plugin-angular`, AOT). `@angular/router` is Angular's official router — a standalone routing library you configure (`provideRouter`, like vue-router), NOT framework-bundled — and the ONLY serious Angular router (no third-party alternatives), so this is a two-engine cohort by ecosystem reality.",
    scopeNote: "**Scope — the two Angular full routers, like-for-like.** The honest picture: **`@angular/router` is a mature, well-optimized official router that wins most raw metrics** — cold-start (~3× lighter boot), nav-latency, param-nav, wide-config (flat AND a lighter floor — its matcher does not degrade), table-heap memory (3.67 vs 8.72 MB @10k), nav-churn CPU, nested-switch. **real-router wins two:** `active-links` (its shared cached active-source vs per-link `routerLinkActive`) and `link-build` (reverse-matcher vs URL-tree serialization). deep-config is ~a wash (both O(depth)). Unlike React/Vue (trie wins scale + memory) and Svelte (trie wins scale vs an O(N) competitor), **Angular's official matcher is flat AND lean, so real-router's structural trie advantage doesn't separate here** — and real-router pays a heavier boot (upfront trie build) and route-table memory. real-router's genuine edges here are active-links, link-build, validated search (capability), and the cross-framework single routing model.",
    capabilityIntro: "Both are full routers. `✓` = built-in API, `N/A` = none. `@angular/router` is feature-mature; the one gap vs real-router is schema-validated search.",
    capabilities: [
      { feature: "Data on navigation (loader tied to route)", support: { "real-router": "✓", "angular-router": "✓" }, basis: "rr: `onEnter` + `lifecycle`/`preload` plugin · @angular/router: `resolve` resolvers" },
      { feature: "Typed / validated search params (schema)", support: { "real-router": "✓", "angular-router": "N/A" }, basis: "rr: `searchSchema` (zod) · @angular/router: raw `queryParams` (typed via input binding, no schema validation)" },
      { feature: "Blocking guard (canDeactivate / unsaved-changes)", support: { "real-router": "✓", "angular-router": "✓" }, basis: "rr: `canDeactivate` · @angular/router: `CanDeactivate` route guard" },
      { feature: "Built-in scroll restoration", support: { "real-router": "✓", "angular-router": "✓" }, basis: "rr: `<RouterProvider>` scrollRestoration · @angular/router: `withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })`" },
    ],
    capabilityLegend: "`✓` / `N/A` are API-verified against each router's surface. `N/A` = feature-absence, not a speed loss.",
    capabilityReading: "**Reading:** `@angular/router` covers data, guard, and scroll restoration first-class; the single gap is **schema-validated search** (real-router's `searchSchema`). So real-router's capability edge in Angular is narrow (one axis) — the honest differentiators are perf on active-links/link-build + validated search + the cross-framework single routing model, not a broad feature or scale advantage.",
    baselineNote: "`_baseline` is the same pages with **no router** — manual `signal` view + `history.pushState`, raw `<a>`. Subtract it and `+Δ` is each router's marginal cost.",
    baselineReading: "**Reading:** over bare Angular, `@angular/router` adds very little at boot (~0.4 ms) and on the hot path; real-router adds ~5 ms at boot (upfront trie build) and more per-nav. (The baseline's `nav-latency` reads oddly high — its manual click→pushState→signal path — so read the two routers against each other there, not vs baseline.)",
    caveats: [
      "- **No cross-framework ranking** — both columns are the same framework (Angular); the delta is router work.",
      "- **`@angular/router` is the only serious Angular router** — no third-party standalone alternatives exist (unlike React/Vue/Solid/Svelte), so this is a two-engine cohort by ecosystem reality, not exclusion.",
      "- **Deep-config is directional** — both rise O(depth), not decomposed for Angular. #1094's Solid research found the analogous rise was ~60% a Solid-specific bench-app artifact + adapter bugs (fix is `packages/solid`-only). Real apps rarely nest past ~10.",
      "- **real-router's heavier cold-start (~3× the boot script) is the upfront segment-trie build** (createRouter + start) — cross-cohort-consistent (~4.5–7 ms across solid/svelte/angular), the price of O(1) matching paid at boot; a design trade-off, not a defect.",
      "- **`@real-router/angular` `<Link>` link-build** — the shared active-name selector fast path already shipped (#1104, parallel to Svelte's #1101); the residual link-build cost is `buildPath` per link (inherent — React/Solid rr pay it and still win link-build) + Angular directive/effect instantiation, not a per-link subscription.",
      "- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.",
      "- `wide`/`deep` are scaling sweeps — the per-size *curve* matters (both flat on wide; deep both O(depth)).",
      "- **real-router `nav-latency` `script` is near timer granularity** (sub-0.6 ms → inflated *relative* variance); at n=15 it sits within the RME gate. The nav-latency *total* + the headline findings (cold-start, wide/deep sweeps, table-heap, active-links, link-build) rest on stable, larger-magnitude signals (RME < ~5%).",
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
