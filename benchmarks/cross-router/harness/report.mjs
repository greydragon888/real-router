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
  { id: "cold-start", title: "Cold start", rows: [["scriptDurationMs", "main-thread script", "ms", "lower"], ["jsHeapMB", "JS heap (retained, post-GC)", "MB", "lower"], ["jsHeapPreGcMB", "· JS heap @FCP (pre-GC, boot garbage — diag #1454)", "MB", "lower"], ["fcpMs", "FCP", "ms", "lower"]] },
  { id: "nav-latency", title: "Navigation — per-nav wall-clock (click→DOM settle)", rows: [["navMsWall", "nav / wall (click→settle)", "ms", "lower"], ["navMsTask", "· nav / task (ΔTaskDuration)", "ms", "lower"], ["scriptDurationMs", "· ⚠ script (V8, microtask-blind #1451)", "ms", "lower"], ["blinkMs", "· blink diag (gap=0, #1452)", "ms", "lower"], ["allocKBPerNav", "alloc / nav (GC pressure)", "KB", "lower"]] },
  { id: "param-nav", title: "Param navigation — per-nav wall-clock (click→DOM settle)", rows: [["navMsWall", "nav / wall (click→settle)", "ms", "lower"], ["navMsTask", "· nav / task (ΔTaskDuration)", "ms", "lower"], ["scriptDurationMs", "· ⚠ script (V8, microtask-blind #1451)", "ms", "lower"], ["blinkMs", "· blink diag (gap=0, #1452)", "ms", "lower"], ["allocKBPerNav", "alloc / nav (GC pressure)", "KB", "lower"]] },
  { id: "wide-config", title: "Wide config — matcher breadth (sweep)", rows: [["navMsTask@10", "nav / task @10", "ms", "lower"], ["navMsTask@100", "nav / task @100", "ms", "lower"], ["navMsTask@1000", "nav / task @1000", "ms", "lower"], ["navMsWall@1000", "· nav / wall @1000 (felt)", "ms", "lower"], ["scriptMs@10", "· ⚠ script (V8, microtask-blind #1451) @10", "ms", "lower"], ["scriptMs@100", "· ⚠ script @100", "ms", "lower"], ["scriptMs@1000", "· ⚠ script @1000", "ms", "lower"]] },
  { id: "table-heap", title: "Route-table memory — heap to hold N routes (sweep)", rows: [["jsHeapMB@1", "heap @1 (floor)", "MB", "lower"], ["jsHeapMB@1000", "heap @1k", "MB", "lower"], ["jsHeapMB@10000", "heap @10k", "MB", "lower"]] },
  { id: "deep-config", title: "Deep config — nesting depth (sweep)", rows: [["navMsTask@3", "nav / task @3", "ms", "lower"], ["navMsTask@30", "nav / task @30", "ms", "lower"], ["navMsTask@60", "nav / task @60", "ms", "lower"], ["navMsTask@90", "nav / task @90", "ms", "lower"], ["navMsWall@90", "· nav / wall @90 (felt)", "ms", "lower"], ["scriptMs@3", "· ⚠ script (V8, microtask-blind #1451) @3", "ms", "lower"], ["scriptMs@30", "· ⚠ script @30", "ms", "lower"], ["scriptMs@60", "· ⚠ script @60", "ms", "lower"], ["scriptMs@90", "· ⚠ script @90", "ms", "lower"]] },
  { id: "search-param-scaling", title: "Search-param scaling — query-param count (sweep, reads all values)", rows: [["navMsTask@1", "nav / task @1", "ms", "lower"], ["navMsTask@10", "nav / task @10", "ms", "lower"], ["navMsTask@50", "nav / task @50", "ms", "lower"], ["navMsWall@50", "· nav / wall @50 (felt)", "ms", "lower"], ["scriptMs@1", "· ⚠ script (query-parse, V8-blind #1451) @1", "ms", "lower"], ["scriptMs@10", "· ⚠ script @10", "ms", "lower"], ["scriptMs@50", "· ⚠ script @50", "ms", "lower"], ["allocKBPerNav", "alloc / nav @50↔@1 (GC pressure)", "KB", "lower"]] },
  { id: "nav-churn", title: "Nav churn (stress)", rows: [["navMsWall", "nav / wall (= 1000/navsPerSec)", "ms", "lower"], ["navMsTask", "· nav / task (ΔTaskDuration)", "ms", "lower"], ["navsPerSec", "throughput (real, settle-timed)", "/s", "higher"], ["scriptMsPerNav", "· ⚠ script / nav (microtask-blind #1451)", "ms", "lower"], ["blinkMsPerNav", "· blink diag (gap=0, #1452)", "ms", "lower"], ["heapDeltaKB", "heap Δ 0→200 navs (⚠ warmup-dominated, not a leak #1462)", "KB", "lower"]] },
  { id: "active-links", title: "Active links (100) — per-nav wall-clock (click→DOM settle)", rows: [["navMsWall", "nav / wall (click→settle)", "ms", "lower"], ["navMsTask", "· nav / task (ΔTaskDuration)", "ms", "lower"], ["scriptDurationMs", "· ⚠ script (V8, microtask-blind #1451)", "ms", "lower"], ["blinkMs", "· blink diag (gap=0, #1452)", "ms", "lower"]] },
  { id: "back-forward", title: "Back / forward — per-nav wall-clock (popstate → DOM settle)", rows: [["navMsWall", "nav / wall (back/fwd→settle)", "ms", "lower"], ["navMsTask", "· nav / task (ΔTaskDuration)", "ms", "lower"], ["scriptDurationMs", "· ⚠ script (V8, microtask-blind #1451)", "ms", "lower"], ["blinkMs", "· blink diag (gap=0; rr 2×/nav honest)", "ms", "lower"], ["allocKBPerNav", "alloc / nav (GC pressure)", "KB", "lower"]] },
  { id: "link-build", title: "Link build — mount 1000 links (href construction, wall-clock)", rows: [["mountMs", "mount 1000 links (wall → DOM-commit, pre-paint; #1462)", "ms", "lower"]] },
  { id: "nested-switch", title: "Nested switch (reuse) — per-nav wall-clock (click→DOM settle)", rows: [["navMsWall", "nav / wall (click→settle)", "ms", "lower"], ["navMsTask", "· nav / task (ΔTaskDuration)", "ms", "lower"], ["scriptDurationMs", "· ⚠ script (V8, microtask-blind #1451)", "ms", "lower"], ["blinkMs", "· blink diag (gap=0, #1452)", "ms", "lower"]] },
];

const REACT_BLURBS = {
  "cold-start": "App init + parse/exec to first route painted (small route table).",
  "nav-latency": (h) => `Per-nav **wall** (click→DOM settle, felt) + **task** (ΔTaskDuration, CPU); \`script\`/\`blink\` are ⚠ diagnostics. **real-router is the lightest — winning both wall and task**, at roughly **half** react-router's felt latency and well under tanstack. *(Sub-ms per-nav: absolutes are session/load-dependent — read the ranking + ratio, not the ms.)* **\`alloc/nav\` (GC pressure): real-router is the leanest allocator too** — its compact immutable State allocates ~${h.kb("allocKBPerNav", "real-router")} KB/nav vs react-router ~${h.kb("allocKBPerNav", "react-router")} (**${h.x("allocKBPerNav", "real-router", "react-router")}**) and tanstack ~${h.kb("allocKBPerNav", "tanstack")} (**${h.x("allocKBPerNav", "real-router", "tanstack")}**), whose per-nav pipeline produces far more transient garbage.`,
  "param-nav": (h) => `Per-nav wall + task changing :id (steady-state sweep /users/1→2→3…). **real-router lightest** — wall ${h.m("navMsWall", "real-router")} vs react-router ${h.m("navMsWall", "react-router")} (${h.x("navMsWall", "real-router", "react-router")}), tanstack ${h.m("navMsWall", "tanstack")}; lowest task. *(Sub-ms — read ranking/ratio, not absolute ms.)* \`alloc/nav\`: real-router's immutable State references the new \`:id\` rather than re-copying — ~${h.kb("allocKBPerNav", "real-router")} KB/nav vs react-router ~${h.kb("allocKBPerNav", "react-router")} (${h.x("allocKBPerNav", "real-router", "react-router")}) and tanstack ~${h.kb("allocKBPerNav", "tanstack")} (${h.x("allocKBPerNav", "real-router", "tanstack")}).`,
  "wide-config": (h) => `Navigate into a flat 1000-route table; per size **task** (CPU matcher) + **wall @1000** (felt). Flat curve = O(1)/trie, rising = O(N)/scan. **real-router stays flat and wins every size** — task@1000 **${h.m("navMsTask@1000", "real-router")} vs react-router ${h.m("navMsTask@1000", "react-router")} (${h.x("navMsTask@1000", "real-router", "react-router")}) and tanstack ${h.m("navMsTask@1000", "tanstack")} (${h.x("navMsTask@1000", "real-router", "tanstack")})**; react-router degrades with N (O(N) scan). The matcher win is decisive.`,
  "table-heap": (h) => `Retained JS heap holding a table of 1 / 1000 / 10000 routes (forced GC; @1 ≈ the React/app floor). The memory counterpart to wide-config. real-router's segment trie *historically* cost the most here — but heap-profiling traced the bulk to **empty per-route collections + redundant indexes, not the trie itself**, and **#1009 + #1010 removed them** (shared frozen sentinels, a monomorphic \`CompiledRoute\`, and dropping two duplicate \`name→route\` maps). At 10k real-router is now the **lightest** of the three — **${h.m("jsHeapMB@10000", "real-router")} MB vs react-router ${h.m("jsHeapMB@10000", "react-router")} (${h.x("jsHeapMB@10000", "real-router", "react-router")}) and tanstack ${h.m("jsHeapMB@10000", "tanstack")} (${h.x("jsHeapMB@10000", "real-router", "tanstack")})** — while keeping the flat O(1) match; the benchmark drove a real core optimization. At the @1 floor real-router (${h.m("jsHeapMB@1", "real-router")}) sits a hair over react-router (${h.m("jsHeapMB@1", "react-router")}). heap is the most stable signal (RME < 0.3%).`,
  "deep-config": (h) => `Navigate into a 90-level nested chain (sweep 3 / 30 / 60 / 90). **real-router scales cleanly and monotonically** (${h.m("navMsTask@3", "real-router")} → ${h.m("navMsTask@30", "real-router")} → ${h.m("navMsTask@60", "real-router")} → ${h.m("navMsTask@90", "real-router")} ms task) and **wins every realistic depth — ${h.x("navMsTask@3", "real-router", "react-router")} @3, ${h.x("navMsTask@30", "real-router", "react-router")} @30, ${h.x("navMsTask@60", "real-router", "react-router")} @60** vs react-router. **react-router's curve is a parabola**: it rises to ~${h.m("navMsTask@60", "react-router")} ms at depth 60 (${h.x("navMsTask@60", "real-router", "react-router")} real-router) then **declines to ~${h.m("navMsTask@90", "react-router")} ms at depth 90**, so at the single @90 point it dips below real-router's honest ${h.m("navMsTask@90", "real-router")}. Root cause (CPU-profiled + confirmed in react-router source): \`matchRoutes\` tries route branches **deepest-first** (\`computeScore\` ranks more segments higher) and re-matches every *deeper* branch before reaching the target — depth D wastes \`O((maxDepth−D)×D)\` path re-normalization (\`matchRouteBranch\`/\`joinPaths\`), maximal mid-depth, zero only when the target *is* the deepest route (@90). real-router walks its precompiled segment trie straight to the match (O(depth), no branch-retrying, no per-nav string normalization). Real apps rarely nest past ~10, where real-router wins outright. *(@90 is the react-router parabola's zero-point, not a real-router regression — read the whole curve.)*`,
  "search-param-scaling": (h) => `Navigate into routes with 1 / 10 / 50 **query** params (\`/sN?k1=v1&…\`) — the realistic high-count vector (marketplace filters / analytics / tracking; path params top out at ~4). The leaf reads EVERY value, so lazy query is materialized (apples-to-apples). **real-router wins @50 — task ${h.m("navMsTask@50", "real-router")} vs react-router ${h.m("navMsTask@50", "react-router")}, tanstack ${h.m("navMsTask@50", "tanstack")} — and stays flat across @10→@50** (eager immutable params make reading all 50 a cheap property access). **tanstack EXPLODES — ${h.m("navMsTask@50", "tanstack")} ms @50 (${h.x("navMsTask@50", "real-router", "tanstack")} real-router), O(query-count)**: its per-nav search parse + validate + structural-share pipeline. react-router is flat too (${h.m("navMsTask@50", "react-router")} @50 — \`URLSearchParams\` is a cheap plain object) but no lower. **\`alloc/nav\` (GC pressure, @50↔@1 toggle) tells the SAME story in memory:** real-router allocates ~${h.kb("allocKBPerNav", "real-router")} KB/nav **flat** — its eager params *reference* the browser's URL-parsed strings instead of copying — vs react-router ~${h.kb("allocKBPerNav", "react-router")} and tanstack ~${h.kb("allocKBPerNav", "tanstack")} (**${h.x("allocKBPerNav", "real-router", "tanstack")}**). So the eager model wins **both** axes at high count — flat CPU *and* far less garbage — refuting the intuition that an eager snapshot must produce more garbage.`,
  "nav-churn": (h) => `200-nav stress; per-nav **task** (CPU) + retained **heap Δ**. **real-router lightest CPU/nav — task ${h.m("navMsTask", "real-router")}** vs react-router ${h.m("navMsTask", "react-router")}, tanstack ${h.m("navMsTask", "tanstack")} — **and retains the least heap (${h.kb("heapDeltaKB", "real-router")} KB)** (react-router ${h.kb("heapDeltaKB", "react-router")}, tanstack ${h.kb("heapDeltaKB", "tanstack")}). \`navsPerSec\` is settle-timed throughput; read CPU/nav + heap (heap Δ is warmup-dominated, not a leak #1462).`,
  "active-links": (h) => `Per-nav wall recompute across 100 links (steady-state toggle). **real-router lightest by a wide margin — wall ${h.m("navMsWall", "real-router")} ms vs tanstack ${h.m("navMsWall", "tanstack")} / react-router ${h.m("navMsWall", "react-router")} (${h.x("navMsWall", "real-router", "react-router")})**: a shared cached active-source recomputes all 100 links off **one** \`router.subscribe\`, where react-router / tanstack pay per-link active machinery. **This is a cross-cohort strength — real-router leads active-links in four of five cohorts** (Svelte + Angular wins below; Solid near-parity; only Vue's fine-grained reactivity edges it).`,
  "link-build": (h) => `CPU to mount 1000 \`<Link>\`s at once — each builds its href via the router's reverse-matcher (\`buildPath\` / \`generatePath\` / \`buildLocation\`), isolated from route construction (done once at startup). A real cost for link-heavy pages (nav menus, sitemaps, paginated lists). **real-router leanest — ${h.m("mountMs", "real-router")} ms** (its \`<Link>\` active state resolves through a shared per-router active-name selector — one \`router.subscribe\` for all links, not a subscription per link); react-router ${h.m("mountMs", "react-router")} (${h.x("mountMs", "real-router", "react-router")}), tanstack ${h.m("mountMs", "tanstack")} (${h.x("mountMs", "real-router", "tanstack")}).`,
  "nested-switch": (h) => `Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **real-router lightest — wall ${h.m("navMsWall", "real-router")} ms** vs react-router ${h.m("navMsWall", "react-router")} / tanstack ${h.m("navMsWall", "tanstack")} (${h.x("navMsWall", "real-router", "react-router")}).`,
  "back-forward": (h) => `Browser **back/forward** (popstate) steady-state — the distinct history-traversal path (every other scenario drives \`pushState\` *forward*; this drives \`history.back()/forward()\`, one of the commonest real ops). **real-router WINS — wall ${h.m("navMsWall", "real-router")} ms vs react-router ${h.m("navMsWall", "react-router")}, tanstack ${h.m("navMsWall", "tanstack")} (${h.x("navMsWall", "real-router", "react-router")})**. **#1353 landed** (skip no-op popstate \`replaceState\`): real-router now fires **1** \`updateForSameDocumentNavigation\`/nav (the browser's own traversal), not 2 — the redundant second history event on back/forward is gone. Leanest allocator too (~${h.kb("allocKBPerNav", "real-router")} KB/nav vs react-router ${h.kb("allocKBPerNav", "react-router")} / tanstack ${h.kb("allocKBPerNav", "tanstack")}). *(${h.n()} — ranking robust.)*`,
};


const VUE_BLURBS = {
  "cold-start": "App init + parse/exec to first route painted. vue-router is the lightest to boot, real-router middle, tanstack heaviest.",
  "nav-latency": (h) => `Per-nav **wall** (click→DOM settle, felt) + **task** (ΔTaskDuration, CPU). On the ⚠ \`script\` diagnostic vue-router looks ~2× leaner (Vue's fine-grained reactivity: a minimal reactive-ref update + \`<RouterView>\` swap) — **but \`script\` is V8-only, blind to Blink C++ + microtasks.** The felt **wall** tells the real story: **real-router WINS ${h.x("navMsWall", "real-router", "vue-router")} — ${h.m("navMsWall", "real-router")} vs vue-router ${h.m("navMsWall", "vue-router")}, tanstack ${h.m("navMsWall", "tanstack")}** — because vue-router fires \`history.pushState\` **2×/nav** (\`replaceState\`+\`pushState\`) vs real-router **1×**, and the settle-timed wall captures the Blink work \`script\` misses. *(Sub-ms — read ranking/ratio; the load-bearing fact is structural: vue-router's 2× vs real-router's 1× \`pushState\` is exact from source.)* \`alloc/nav\`: real-router leanest too (~${h.kb("allocKBPerNav", "real-router")} KB vs vue-router ${h.kb("allocKBPerNav", "vue-router")} / tanstack ${h.kb("allocKBPerNav", "tanstack")}).`,
  "param-nav": (h) => `Per-nav wall + task changing :id (steady-state sweep). **real-router wins felt wall — ${h.m("navMsWall", "real-router")} vs vue-router ${h.m("navMsWall", "vue-router")}, tanstack ${h.m("navMsWall", "tanstack")}** — the \`script\`-diagnostic's vue-router lead is offset by its 2× \`pushState\` in the settle-timed wall. *(Sub-ms — read ranking/ratio.)* \`alloc/nav\`: real-router leanest (~${h.kb("allocKBPerNav", "real-router")} KB vs vue-router ${h.kb("allocKBPerNav", "vue-router")} / tanstack ${h.kb("allocKBPerNav", "tanstack")}).`,
  "wide-config": (h) => `Navigate into a flat 1000-route table — **the matcher crossover.** vue-router is lightest at small N (lean Vue floor) but **degrades @1000** (O(N) matcher); **real-router stays flat and WINS @1000 — task ${h.m("navMsTask@1000", "real-router")} vs vue-router ${h.m("navMsTask@1000", "vue-router")}, tanstack ${h.m("navMsTask@1000", "tanstack")}** (${h.x("navMsTask@1000", "real-router", "vue-router")}). The trie's structural win at scale survives the honest metric.`,
  "table-heap": (h) => `Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **real-router is the lightest at 10k — ${h.m("jsHeapMB@10000", "real-router")} MB vs vue-router ${h.m("jsHeapMB@10000", "vue-router")} (${h.x("jsHeapMB@10000", "real-router", "vue-router")}) and tanstack ${h.m("jsHeapMB@10000", "tanstack")}** (the #1009/#1010-optimized trie). At scale real-router wins both CPU (wide) and memory.`,
  "deep-config": (h) => `Navigate into a 90-level nested chain. **vue-router stays near-flat and is leanest at depth** (${h.m("navMsTask@3", "vue-router")} → ${h.m("navMsTask@90", "vue-router")} @90 — a sublinear matcher); **real-router rises** (${h.m("navMsTask@3", "real-router")} → ${h.m("navMsTask@90", "real-router")} @90); **tanstack explodes O(depth)** (${h.m("navMsTask@3", "tanstack")} → ${h.m("navMsTask@90", "tanstack")}, ${h.x("navMsTask@90", "real-router", "tanstack")} real-router @90). real-router wins @3, but vue-router's flat deep curve leads from ~@30; both full pipelines stay bounded while tanstack's deep-nav cost grows. Real apps rarely nest past ~10.`,
  "search-param-scaling": (h) => `Navigate into routes with 1 / 10 / 50 **query** params (\`/sN?k1=v1&…\`, the realistic high-count vector), reading every value. **real-router WINS @50 — task ${h.m("navMsTask@50", "real-router")} vs vue-router ${h.m("navMsTask@50", "vue-router")}, tanstack ${h.m("navMsTask@50", "tanstack")}** — and stays flat across @10→@50 (eager immutable params). vue-router's \`route.query\` is a plain reactive object but costs more at count here; **tanstack rises steeply** (O(count) parse/validate/structural-share). *(Flat-vs-rising is the robust story; sub-ms flat absolutes are session-dependent.)* **\`alloc/nav\` (GC pressure) agrees:** real-router is the **leanest allocator — ~${h.kb("allocKBPerNav", "real-router")} KB/nav vs vue-router ${h.kb("allocKBPerNav", "vue-router")} (${h.x("allocKBPerNav", "real-router", "vue-router")}) and tanstack ${h.kb("allocKBPerNav", "tanstack")} (${h.x("allocKBPerNav", "real-router", "tanstack")})** — its eager params reference URL-parsed strings (flat), winning the memory axis too — refuting 'eager = more garbage' even against the lean-object competitor.`,
  "nav-churn": (h) => `200-nav stress; per-nav **task** (CPU) + retained **heap Δ**. **real-router lightest CPU/nav — task ${h.m("navMsTask", "real-router")}** vs vue-router ${h.m("navMsTask", "vue-router")}, tanstack ${h.m("navMsTask", "tanstack")}; **real-router retains the least heap (${h.kb("heapDeltaKB", "real-router")} KB ≈ vue-router ${h.kb("heapDeltaKB", "vue-router")}; tanstack ${h.x("heapDeltaKB", "real-router", "tanstack")} at ${h.kb("heapDeltaKB", "tanstack")})**. \`navsPerSec\` is settle-timed — read CPU/nav + heap (heap Δ warmup-dominated, not a leak #1462).`,
  "active-links": (h) => `Per-nav wall recompute across 100 links (steady-state toggle). **vue-router leads — ${h.m("navMsWall", "vue-router")} vs real-router ${h.m("navMsWall", "real-router")} (${h.x("navMsWall", "real-router", "vue-router")}), tanstack ${h.m("navMsWall", "tanstack")}** — the one cohort where real-router cedes active-links. Vue's fine-grained reactivity keeps per-link active updates lean enough that real-router's shared active-source doesn't separate from it (real-router wins active-links in React / Solid / Svelte / Angular). *(Sub-ms — session/load-dependent.)*`,
  "link-build": (h) => `Wall-clock to mount 1000 links, each building its href (real-router \`buildPath\` · vue-router \`resolve\` · tanstack build). **real-router leanest — ${h.m("mountMs", "real-router")} ms** vs vue-router ${h.m("mountMs", "vue-router")}, tanstack ${h.m("mountMs", "tanstack")} (${h.x("mountMs", "real-router", "tanstack")}). Vue's link mount is latency-bound (reactive cascade) over the ~3.5 ms bare-Vue floor; real-router adds the least — the reverse-matcher \`buildPath\` is cheaper than vue-router's \`resolve\` here.`,
  "nested-switch": (h) => `Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **real-router WINS — wall ${h.m("navMsWall", "real-router")} vs vue-router ${h.m("navMsWall", "vue-router")}, tanstack ${h.m("navMsWall", "tanstack")}** (${h.x("navMsWall", "real-router", "vue-router")}). *(Sub-ms — session/load-dependent.)*`,
  "back-forward": (h) => `Browser **back/forward** (popstate) steady-state. **real-router WINS — wall ${h.m("navMsWall", "real-router")} vs vue-router ${h.m("navMsWall", "vue-router")}, tanstack ${h.m("navMsWall", "tanstack")}** — a **flip after #1353**: skipping the no-op popstate \`replaceState\` removed real-router's redundant second history event, turning a loss into a ${h.x("navMsWall", "real-router", "vue-router")} win over vue-router's single-popstate. Leaner allocator too (~${h.kb("allocKBPerNav", "real-router")} KB vs vue-router ${h.kb("allocKBPerNav", "vue-router")} / tanstack ${h.kb("allocKBPerNav", "tanstack")}). *(${h.n()}.)*`,
};

const SOLID_BLURBS = {
  "cold-start": (h) => `App init + parse/exec to first route painted. **@solidjs/router is the lightest to boot** (~${h.m("scriptDurationMs", "solid-router")} ms script); **real-router is heaviest (~${h.m("scriptDurationMs", "real-router")} ms), tanstack ~${h.m("scriptDurationMs", "tanstack")}** — cold-start is real-router's known weak axis (eager \`@real-router/core\` parse + init, #1106; cross-cohort-consistent). Over the bare-Solid floor (~0.9 ms) all three add real startup, @solidjs/router the least.`,
  "nav-latency": (h) => `Per-nav **wall** (click→DOM settle, felt) + **task** (ΔTaskDuration, CPU). **real-router is the leanest per-nav — wall ${h.m("navMsWall", "real-router")} vs @solidjs/router ${h.m("navMsWall", "solid-router")} (${h.x("navMsWall", "real-router", "solid-router")}), tanstack ${h.m("navMsWall", "tanstack")}** — it wins wall *and* task outright (unlike the Vue cohort, where the native router's reactivity leads the \`script\` diagnostic). *(Sub-ms — read ranking/ratio, not absolute ms.)* \`alloc/nav\`: real-router leanest (~${h.kb("allocKBPerNav", "real-router")} KB vs @solidjs/router ${h.kb("allocKBPerNav", "solid-router")} / tanstack ${h.kb("allocKBPerNav", "tanstack")}).`,
  "param-nav": (h) => `Per-nav wall + task changing :id (steady-state). **real-router leanest — wall ${h.m("navMsWall", "real-router")} vs @solidjs/router ${h.m("navMsWall", "solid-router")}, tanstack ${h.m("navMsWall", "tanstack")}** (@solidjs/router's leaner \`script\` diagnostic is offset by its 2× \`pushState\` in the settle-timed wall). *(Sub-ms — session/load-dependent.)* \`alloc/nav\`: real-router leanest (~${h.kb("allocKBPerNav", "real-router")} KB vs @solidjs/router ${h.kb("allocKBPerNav", "solid-router")} / tanstack ${h.kb("allocKBPerNav", "tanstack")}).`,
  "wide-config": (h) => `Navigate into a flat 1000-route table. **real-router stays flat and WINS @1000 — task ${h.m("navMsTask@1000", "real-router")} vs @solidjs/router ${h.m("navMsTask@1000", "solid-router")} (${h.x("navMsTask@1000", "real-router", "solid-router")}), tanstack ${h.m("navMsTask@1000", "tanstack")}** — @solidjs/router is *not* flat at scale (it degrades with N here), so the segment trie's structural edge shows in Solid too (as in React/Vue, unlike the earlier read). real-router's O(1) match holds the low flat curve.`,
  "deep-config": (h) => `Navigate into a 90-level nested chain. **real-router WINS at every depth — task ${h.m("navMsTask@3", "real-router")} → ${h.m("navMsTask@90", "real-router")} @90 vs @solidjs/router ${h.m("navMsTask@3", "solid-router")} → ${h.m("navMsTask@90", "solid-router")}** — both rise ~linearly. The steep O(d²) rise seen in earlier runs was a **bench-app artifact** (an O(depth²) lazy-getter chain, since fixed) — the residual linear cost is \`@real-router/solid\`'s \`RouteView\` per-level composition (#1094), but it stays *under* @solidjs/router's deep curve. **@tanstack/solid-router is N/A** — it triggers its internal error boundary on 60+-segment deep routes (the @tanstack/react-router equivalent renders depth 90). Real apps rarely nest past ~10.`,
  "search-param-scaling": (h) => `Navigate into routes with 1 / 10 / 50 **query** params (\`/sN?k1=v1&…\`, the realistic high-count vector), reading every value — **where forcing materialization bites the lazy router.** **real-router stays FLAT and WINS @50 — task ${h.m("navMsTask@50", "real-router")} vs @solidjs/router ${h.m("navMsTask@50", "solid-router")} (${h.x("navMsTask@50", "real-router", "solid-router")}), tanstack ${h.m("navMsTask@50", "tanstack")}** (eager immutable params). **@solidjs/router RISES steeply**: its \`useSearchParams()\` reactive store charges a reactive read per value, so @1 it leads (${h.m("navMsTask@1", "solid-router")} vs real-router ${h.m("navMsTask@1", "real-router")}) but by @50 real-router's flat curve overtakes it. At the realistic high-count end the lazy advantage inverts. **\`alloc/nav\`** (GC pressure): real-router ~${h.kb("allocKBPerNav", "real-router")} KB/nav vs @solidjs/router ~${h.kb("allocKBPerNav", "solid-router")} (${h.x("allocKBPerNav", "real-router", "solid-router")}) / tanstack ~${h.kb("allocKBPerNav", "tanstack")} — eager params reference URL-parsed strings, flat with count; the memory counterpart to the flat CPU curve.`,
  "table-heap": (h) => `Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **@solidjs/router lightest at 10k (${h.m("jsHeapMB@10000", "solid-router")} MB) — real-router near-parity (${h.m("jsHeapMB@10000", "real-router")}, ${h.x("jsHeapMB@10000", "real-router", "solid-router")}), tanstack heaviest (${h.m("jsHeapMB@10000", "tanstack")}).** Unlike the React/Vue cohorts (where real-router's trie wins memory), @solidjs/router's minimal route storage matches it here; the trie's space cost is nearly free at this scale.`,
  "nav-churn": (h) => `200-nav stress; per-nav **task** (CPU) + retained **heap Δ**. **real-router leanest CPU/nav — task ${h.m("navMsTask", "real-router")}** (< @solidjs/router ${h.m("navMsTask", "solid-router")} < tanstack ${h.m("navMsTask", "tanstack")}); **@solidjs/router retains the least heap (${h.kb("heapDeltaKB", "solid-router")} KB), real-router ${h.kb("heapDeltaKB", "real-router")}, tanstack ${h.kb("heapDeltaKB", "tanstack")}.** \`navsPerSec\` is NOT comparable here: real-router navigates synchronously (churns 200 navs without yielding → ~15k/s) while @solidjs/router + tanstack defer to the frame cadence — read CPU/nav + heap (heap Δ warmup-dominated, not a leak #1462).`,
  "active-links": (h) => `Per-nav wall recompute across 100 links (steady-state toggle). **real-router WINS decisively — wall ${h.m("navMsWall", "real-router")} vs @solidjs/router ${h.m("navMsWall", "solid-router")} (${h.x("navMsWall", "real-router", "solid-router")}), tanstack ${h.m("navMsWall", "tanstack")}** — its shared cached active-source (one \`router.subscribe\`) beats @solidjs/router's per-\`<A>\` active tracking. Part of real-router's cross-cohort active-links lead (React / Svelte / Angular win too). *(Sub-ms — the win is robust; absolute ms session/load-dependent.)*`,
  "link-build": (h) => `CPU to mount 1000 links, each building its href. **real-router leanest (${h.m("mountMs", "real-router")} ms); @solidjs/router ${h.m("mountMs", "solid-router")}; tanstack (${h.m("mountMs", "tanstack")}, ${h.x("mountMs", "real-router", "tanstack")}).** Over the bare-\`<a>\` floor real-router adds the least reverse-matcher cost.`,
  "nested-switch": (h) => `Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **real-router leanest — wall ${h.m("navMsWall", "real-router")} vs @solidjs/router ${h.m("navMsWall", "solid-router")}, tanstack ${h.m("navMsWall", "tanstack")}** (${h.x("navMsWall", "real-router", "solid-router")}), consistent with its nav-latency / param-nav wins here. *(Sub-ms — session/load-dependent.)*`,
  "back-forward": (h) => `Browser **back/forward** (popstate) steady-state. **real-router ≈ @solidjs/router — wall ${h.m("navMsWall", "real-router")} vs ${h.m("navMsWall", "solid-router")} (dead heat), tanstack ${h.m("navMsWall", "tanstack")}.** **#1353** (skip no-op popstate \`replaceState\`) closed real-router's earlier ~68% gap to a tie with @solidjs/router's minimal single-popstate. real-router the **leanest allocator of all** (~${h.kb("allocKBPerNav", "real-router")} KB/nav vs @solidjs/router ${h.kb("allocKBPerNav", "solid-router")} / tanstack ${h.kb("allocKBPerNav", "tanstack")}). *(${h.n()}.)*`,
};

const SVELTE_BLURBS = {
  "cold-start": (h) => `App init + parse/exec to first route painted. **sv-router is the lightest to boot** (script ${h.m("scriptDurationMs", "sv-router")} ms, heap ${h.m("jsHeapMB", "sv-router")} MB); mateo-router ${h.m("scriptDurationMs", "mateo-router")} ms / ${h.m("jsHeapMB", "mateo-router")} MB; real-router heaviest (${h.m("scriptDurationMs", "real-router")} ms / ${h.m("jsHeapMB", "real-router")} MB). Over the bare-Svelte floor real-router adds the most boot cost (#1106).`,
  "nav-latency": (h) => `Per-nav **wall** (click→DOM settle, felt) + **task** (CPU). **A near-tie at the Svelte floor — real-router edges the felt wall (${h.m("navMsWall", "real-router")} vs sv-router ${h.m("navMsWall", "sv-router")}, mateo-router ${h.m("navMsWall", "mateo-router")}); task a dead heat (${h.m("navMsTask", "real-router")} ≈ ${h.m("navMsTask", "sv-router")}).** sv-router's \`script\` sits at the bare-Svelte floor (minimal pipeline); on the settle-timed wall real-router's single \`pushState\` keeps it just ahead. *(Sub-ms — the ranking is tight and session/load-dependent; read it as floor-parity.)*`,
  "param-nav": (h) => `Per-nav wall + task changing :id (steady-state). **sv-router leanest (wall ${h.m("navMsWall", "sv-router")}); real-router second (${h.m("navMsWall", "real-router")}, ${h.x("navMsWall", "real-router", "sv-router")}); mateo-router third (${h.m("navMsWall", "mateo-router")})** — sv-router's minimal reactive model sits just below real-router's eager pipeline. *(Sub-ms — session/load-dependent.)*`,
  "wide-config": (h) => `Navigate into a flat 1000-route table — **the matcher crossover, and real-router's clearest win in this cohort.** real-router's segment trie stays FLAT (task ~${h.m("navMsTask@1000", "real-router")} across @10/@100/@1000) while **sv-router degrades O(N)** (${h.m("navMsTask@1000", "sv-router")} @1000 — it sorts + scans its route-key list per nav, NOT a segment trie) and mateo-router carries a high floor (~${h.m("navMsTask@1000", "mateo-router")}). **real-router WINS @1000** — task ${h.m("navMsTask@1000", "real-router")} vs sv-router ${h.m("navMsTask@1000", "sv-router")} (${h.x("navMsTask@1000", "real-router", "sv-router")}), mateo ${h.m("navMsTask@1000", "mateo-router")} — the structural trie advantage holds in Svelte (as in React/Vue/Solid).`,
  "deep-config": (h) => `Navigate into a 90-level nested chain. **All three rise O(depth)** — sv-router leanest (${h.m("navMsTask@90", "sv-router")} @90), real-router second (${h.m("navMsTask@3", "real-router")} → ${h.m("navMsTask@90", "real-router")} @90), mateo-router heaviest (${h.m("navMsTask@90", "mateo-router")}). **Read directionally:** #1094's Solid research found the analogous deep rise was ~60% a *Solid-specific* bench-app artifact plus adapter bugs; the Svelte deep cost has **not** been decomposed the same way, so the split between app-structure and \`@real-router/svelte\` \`RouteView\` composition here is open (the core matcher is flat-capable). **mateo-router renders depth 90 fine** — unlike \`@tanstack/solid-router\`, which errored past ~30 in the Solid cohort. Real apps rarely nest past ~10.`,
  "search-param-scaling": (h) => `Navigate into routes with 1 / 10 / 50 **query** params (\`/sN?k1=v1&…\`, the realistic high-count vector), reading every value. **real-router is FLAT and WINS @50 — task ${h.m("navMsTask@50", "real-router")} vs sv-router ${h.m("navMsTask@50", "sv-router")}, mateo-router ${h.m("navMsTask@50", "mateo-router")}** (eager immutable params): sv-router leads at @1 (its lazy reactive \`route.search\` is cheap for few params) but RISES with count, and real-router's flat curve overtakes it by @50; mateo-router rises steepest. Reading all values at the realistic high-count end is exactly where eager materialization beats per-read reactive query. **\`alloc/nav\`** (GC pressure): real-router ~${h.kb("allocKBPerNav", "real-router")} KB/nav vs sv-router ~${h.kb("allocKBPerNav", "sv-router")} / mateo ~${h.kb("allocKBPerNav", "mateo-router")} — eager params reference URL-parsed strings, flat with count.`,
  "table-heap": (h) => `Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **sv-router wins decisively — ${h.m("jsHeapMB@10000", "sv-router")} MB @10k** (its route table is a plain object map, near-flat with count), vs real-router ${h.m("jsHeapMB@10000", "real-router")} and mateo-router ${h.m("jsHeapMB@10000", "mateo-router")} (heaviest). Unlike the React/Vue cohorts where real-router's trie was the memory winner, sv-router's minimal storage is far leaner here.`,
  "nav-churn": (h) => `200-nav stress; per-nav **task** (CPU) + retained **heap Δ**. **CPU/nav a 3-way tie (~${h.m("navMsTask", "real-router")} task).** sv-router retains the least heap (${h.kb("heapDeltaKB", "sv-router")} KB), mateo-router ${h.kb("heapDeltaKB", "mateo-router")}, real-router ${h.kb("heapDeltaKB", "real-router")} (heaviest here). \`navsPerSec\` is settle-timed ~14k/s for all three — read CPU/nav + heap (heap Δ warmup-dominated, not a leak #1462).`,
  "active-links": (h) => `Per-nav wall recompute across 100 links (steady-state toggle). **real-router WINS — wall ${h.m("navMsWall", "real-router")} vs sv-router ${h.m("navMsWall", "sv-router")}, mateo-router ${h.m("navMsWall", "mateo-router")} (${h.x("navMsWall", "real-router", "sv-router")})** (its shared cached active-source, one \`router.subscribe\`) over per-link active recompute. A clear per-nav win — part of real-router's cross-cohort active-links lead (React / Angular win too). *(Sub-ms — the win is robust; absolute ms session/load-dependent.)*`,
  "link-build": (h) => `CPU to mount 1000 links, each building its href. **sv-router leanest (${h.m("mountMs", "sv-router")} ms ≈ the bare-\`<a>\` floor) — plain \`<a href>\` intercepted by a global click handler, no per-link component**; mateo-router ${h.m("mountMs", "mateo-router")}; **real-router heaviest (${h.m("mountMs", "real-router")} ms)** — after #1101's shared active-name selector removed the per-link subscription, the residual is \`@real-router/svelte\`'s \`<Link>\` running \`buildPath\` per link + per-component instantiation. sv-router avoids both with a literal \`<a href>\`: the Svelte loss is **structural** (component \`<Link>\` vs plain anchor), not slow engineering — \`buildPath\` is inherent and React/Solid/Angular rr pay it and *win* their link-build.`,
  "nested-switch": (h) => `Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **sv-router leanest (wall ${h.m("navMsWall", "sv-router")}); real-router second (${h.m("navMsWall", "real-router")})** on this sub-ms per-nav-render metric. **mateo-router is N/A** — its \`<Router>\` renders through \`{#key result.path.original}\` (the full evaluated URL), so a two-level app REMOUNTS the layout + inner router on every switch (full-remount, not the ancestor-reuse this scenario measures); the reuse contract is inexpressible in this router, so no ranked number is published for it (#1456). *(Sub-ms — session/load-dependent.)*`,
  "back-forward": (h) => `Browser **back/forward** (popstate) steady-state. **Near 3-way tie (~5% spread) after #1353** — sv-router ~${h.m("navMsWall", "sv-router")}, real-router ~${h.m("navMsWall", "real-router")}, mateo-router ~${h.m("navMsWall", "mateo-router")}. The skip-no-op-\`replaceState\` fix cut real-router's back/forward from a **~53% loss to a dead heat** with the two minimal Svelte routers. Allocation near-parity (real-router ~${h.kb("allocKBPerNav", "real-router")} KB; sv-router ~${h.kb("allocKBPerNav", "sv-router")} leanest; mateo ${h.kb("allocKBPerNav", "mateo-router")}). *(${h.n()}.)*`,
};

const ANGULAR_BLURBS = {
  "cold-start": (h) => `App init + parse/exec to first route painted. **@angular/router boots far lighter — script ${h.m("scriptDurationMs", "angular-router")} ms** vs real-router ${h.m("scriptDurationMs", "real-router")} (${h.x("scriptDurationMs", "real-router", "angular-router")} the boot script); **retained heap is at parity (${h.m("jsHeapMB", "real-router")} = ${h.m("jsHeapMB", "angular-router")} MB, post-GC #1454).** Bare-Angular floor ~1.8 ms, so \`@real-router/angular\` adds ~4.3 ms of startup. **Decomposed (#1106, isolation ladder): the excess is CORE, not the adapter** — ~57% is parse+eval of the full \`@real-router/core\` bundle, ~28% is \`createRouter\`+\`start()\` (a warm re-run showed ~90% of *that* is one-time V8 cold-JIT, not initialization *work*); \`provideRealRouter\` DI (~0.04 ms) and \`RouteView\` (~0.64 ms) are cheap. A **code-size-driven one-time cost** — the price of shipping the full pipeline; competitors' lightness ∝ their smaller / tree-shaken code. Cross-cohort-consistent (~4.5–7 ms across solid/svelte/angular). #1106 tracks it (post-1.0 RFC-candidate; SSR/SSG amortizes boot).`,
  "nav-latency": (h) => `Per-nav **wall** (click→DOM settle, felt) + **task** (ΔTaskDuration, CPU). **real-router WINS across the board — felt wall ${h.m("navMsWall", "real-router")} vs @angular/router ${h.m("navMsWall", "angular-router")} (${h.x("navMsWall", "real-router", "angular-router")}), task ${h.m("navMsTask", "real-router")} vs ${h.m("navMsTask", "angular-router")} (${h.x("navMsTask", "real-router", "angular-router")}), and allocation ~${h.kb("allocKBPerNav", "real-router")} vs ${h.kb("allocKBPerNav", "angular-router")} KB/nav (${h.x("allocKBPerNav", "real-router", "angular-router")}).** The felt-wall gap is **fixed (#1466)**: \`RouteView\` and \`injectRoute\` now commit the route DOM synchronously in the click task (a local \`detectChanges()\`) instead of waiting for the deferred zoneless CD flush — \`@angular/router\` activates its \`<router-outlet>\` in-task, and real-router now matches that while doing far less CPU and GC work. *(Sub-ms — read ranking/ratio, not absolute ms.)*`,
  "param-nav": (h) => `Per-nav wall + task changing :id (steady-state). **real-router wins CPU — task ${h.m("navMsTask", "real-router")} vs @angular/router ${h.m("navMsTask", "angular-router")} (${h.x("navMsTask", "real-router", "angular-router")}) and alloc ${h.x("allocKBPerNav", "real-router", "angular-router")} leaner (${h.kb("allocKBPerNav", "real-router")} vs ${h.kb("allocKBPerNav", "angular-router")} KB)** — and felt wall now leads decisively (${h.m("navMsWall", "real-router")} vs ${h.m("navMsWall", "angular-router")}, ${h.x("navMsWall", "real-router", "angular-router")}): the #1466 \`injectRoute\` sync-commit closed the same-route param-render gap that both routers used to pay. *(Sub-ms — session/load-dependent.)*`,
  "wide-config": (h) => `Navigate into a flat 1000-route table. **real-router stays flat and WINS @1000 by a wide margin — task ${h.m("navMsTask@1000", "real-router")} vs @angular/router ${h.m("navMsTask@1000", "angular-router")} (${h.x("navMsTask@1000", "real-router", "angular-router")})** — @angular/router's matcher degrades sharply with N (it is *not* flat at scale), so real-router's segment trie is decisive here (as in React/Vue/Solid/Svelte). Its official router is not a trie.`,
  "deep-config": (h) => `Navigate into a 90-level nested chain. **real-router WINS decisively — task ${h.m("navMsTask@3", "real-router")} → ${h.m("navMsTask@90", "real-router")} @90 vs @angular/router ${h.m("navMsTask@3", "angular-router")} → ${h.m("navMsTask@90", "angular-router")} (${h.x("navMsTask@90", "real-router", "angular-router")} @90)** — both rise O(depth) but @angular/router far steeper. Real apps rarely nest past ~10, where real-router already leads.`,
  "search-param-scaling": (h) => `Navigate into routes with 1 / 10 / 50 **query** params (\`/sN?k1=v1&…\`, the realistic high-count vector), reading every value. **real-router WINS @50 — task ${h.m("navMsTask@50", "real-router")} vs @angular/router ${h.m("navMsTask@50", "angular-router")} (${h.x("navMsTask@50", "real-router", "angular-router")})** — real-router stays flat (eager immutable params) while @angular/router's \`snapshot.queryParams\` cost rises with count. **\`alloc/nav\`** (GC pressure): real-router ~${h.kb("allocKBPerNav", "real-router")} KB/nav vs @angular/router ~${h.kb("allocKBPerNav", "angular-router")} (${h.x("allocKBPerNav", "real-router", "angular-router")}) — eager params reference URL-parsed strings; @angular/router allocates heavily per nav.`,
  "table-heap": (h) => `Retained JS heap holding 1 / 1000 / 10000 routes (forced GC). **@angular/router lighter at 10k — ${h.m("jsHeapMB@10000", "angular-router")} MB vs real-router ${h.m("jsHeapMB@10000", "real-router")}.** real-router's segment-trie route storage is the heavier structure — but unlike the earlier read, it DOES buy the matcher-scale CPU win here (real-router wins wide @1000 ${h.x("navMsTask@1000", "real-router", "angular-router", "wide-config")}, @angular/router's matcher degrades). So this cohort splits: real-router pays memory (trie storage), @angular/router pays CPU at scale.`,
  "nav-churn": (h) => `200-nav stress; per-nav **task** (CPU) + retained **heap Δ**. **real-router wins both — task ${h.m("navMsTask", "real-router")} vs @angular/router ${h.m("navMsTask", "angular-router")}, and retains less heap (${h.kb("heapDeltaKB", "real-router")} KB vs ${h.kb("heapDeltaKB", "angular-router")}).** \`navsPerSec\` is settle-timed and now tracks CPU/nav (the route DOM commits in-task after #1466) — read CPU/nav + heap, not the raw rate (heap Δ warmup-dominated, not a leak #1462).`,
  "active-links": (h) => `Per-nav recompute across 100 links (steady-state toggle). **real-router WINS — task (CPU) ${h.m("navMsTask", "real-router")} vs @angular/router ${h.m("navMsTask", "angular-router")} (${h.x("navMsTask", "real-router", "angular-router")}), and felt wall leads too (${h.m("navMsWall", "real-router")} vs ${h.m("navMsWall", "angular-router")}, ${h.x("navMsWall", "real-router", "angular-router")}) after the #1466 sync-commit.** Its shared cached active-source (one \`router.subscribe\`) beats \`@angular/router\`'s per-link \`routerLinkActive\` router-event subscription — real-router's clearest per-nav win in this cohort, part of its cross-cohort active-links lead (React + Svelte win too). *(Sub-ms — the win is robust; absolute ms session/load-dependent.)*`,
  "link-build": (h) => `CPU to mount 1000 links, each building its href. **real-router leaner — ${h.m("mountMs", "real-router")} ms** vs @angular/router ${h.m("mountMs", "angular-router")}, both heavy over the bare-\`<a>\` floor. real-router's \`RealLink\` runs the reverse-matcher (\`buildPath\`); \`@angular/router\`'s \`routerLink\` serializes a URL tree (config-independent) — different mechanisms, both costly. (\`RealLink\`'s active state uses the shared active-name selector fast path #1104; the residual is \`buildPath\` per link + directive/effect setup, not a per-link subscription.)`,
  "nested-switch": (h) => `Sibling switch a↔b under a shared layout (steady-state) — reuse the parent. **real-router wins CPU — task ${h.m("navMsTask", "real-router")} vs @angular/router ${h.m("navMsTask", "angular-router")} (${h.x("navMsTask", "real-router", "angular-router")})** — and felt wall now leads too (${h.m("navMsWall", "real-router")} vs ${h.m("navMsWall", "angular-router")}, ${h.x("navMsWall", "real-router", "angular-router")}) after the #1466 sync-commit. *(Sub-ms — session/load-dependent.)*`,
  "back-forward": (h) => `Browser **back/forward** (popstate) steady-state. **real-router WINS — wall ${h.m("navMsWall", "real-router")} vs @angular/router ${h.m("navMsWall", "angular-router")} (${h.x("navMsWall", "real-router", "angular-router")}), task ${h.m("navMsTask", "real-router")} vs ${h.m("navMsTask", "angular-router")}.** **#1353** (skip no-op popstate \`replaceState\`) removed real-router's redundant second history event. real-router the leaner **allocator** too (~${h.kb("allocKBPerNav", "real-router")} KB/nav vs @angular/router ${h.kb("allocKBPerNav", "angular-router")}, ${h.x("allocKBPerNav", "real-router", "angular-router")}). *(${h.n()}.)*`,
};

const FW = {
  react: {
    cohortName: "React cohort",
    engines: ["real-router", "tanstack", "react-router"],
    blurbs: REACT_BLURBS,
    baselineLabel: "bare React",
    warningLine: "⚠️ Preliminary local numbers — directional, not a published verdict. Per-nav is reported as **wall** (click→DOM settle — the felt latency) + **task** (ΔTaskDuration — CPU), both stable at n=50 (RME < 3%). The earlier `total = script + Blink` metric was **retired** (#1451/#1452: `ScriptDuration` was blind to promise-microtask work and paced `blinkMs` was inflated 5–15×); `script`/`blink` remain as ⚠ **diagnostic** rows only (V8-only, microtask-blind). Heap/alloc RME < 0.8%. `nav-churn` `navsPerSec` is settle-timed — read CPU/nav + heap.",
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
    baselineReading: "**Reading:** the `(+Δ)` is the router's marginal cost over bare React on the two axes where the baseline is a genuine floor — **boot** and **link mount**. real-router is near-lowest on link overhead; **tanstack pays ~2× the router overhead** on startup and links. real-router's cold-start overhead sits a little above react-router's — partly the `browser-plugin` (real History API) it carries by contract — but both are far below tanstack. (Per-nav is not shown here: an optimized router beats the naive manual-nav baseline, so it is ranked router-vs-router in the tables above — where real-router leads the React cohort.)",
    caveats: [
      "- **No cross-framework ranking** — each column is the same framework (React); the delta is router work.",
      "- **Per-nav is wall + task.** `navMsWall` (click→DOM settle) is the headline felt latency — stable at n=50 (RME < 3%). The earlier decision to drop felt-latency belonged to the retired `total`-metric epoch (whose latency RME was 9–44%); the settle-timed **wall** + **task** (ΔTaskDuration) replaced it (#1451/#1452). `script`/`blink` are kept only as diagnostics.",
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
    warningLine: "⚠️ Preliminary local numbers — directional, not a published verdict. Per-nav is **wall** (click→DOM settle — felt) + **task** (ΔTaskDuration — CPU), both RME < 3% at n=50; the `total = script + Blink` metric was **retired** (#1451/#1452). `script` is a ⚠ **diagnostic** (V8-only, blind to Blink C++ + microtasks — e.g. vue-router's lean `script` misses its 2× `pushState`, which the settle-timed **wall** does capture). Heap/alloc RME < 0.8%. `nav-churn` `navsPerSec` is settle-timed — read CPU/nav + heap.",
    cohortLine: "**Cohort:** `@real-router/vue` · `vue-router@5` (the official Vue 3 router — bumped from v4 by Dependabot #1142; v5 pulls no extra runtime into the measured app bundle, so the comparison stays clean) · `@tanstack/vue-router` — three full routers that own a navigation pipeline (route resolution, guards, nested layouts, reactive/immutable state).",
    scopeNote: "**Scope — three full routers, like-for-like.** No minimalist exclusion is needed: all three own a real navigation pipeline. vue-router 5 is the official Vue 3 router; tanstack is the type-first challenger. The honest split: on **scale** — matcher + memory (wide-config @1000 ~2×, table-heap @10k ~2.3×) — **real-router wins** (O(1) trie + lean core); on **per-nav**, real-router now leads most of the cohort on the settle-timed **wall** (nav-latency, param-nav, nested-switch, back-forward — its 1× vs vue-router's 2× `pushState` carries through where the V8-only `script` diagnostic misses it). **vue-router's fine-grained reactivity stays ahead only on active-links and deep nesting** (its sublinear deep matcher), and it boots lighter. **tanstack is heaviest on memory and degrades at depth**.",
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
    baselineReading: "**Reading:** over bare Vue, on startup vue-router adds the least (+1.7 ms), real-router is middle (+3.0), tanstack heaviest (+4.0). The marginal costs are small — at realistic scale all three are fast. The separation appears **at scale** (wide / table-heap / deep), where real-router's trie wins CPU *and* memory and tanstack degrades. (Per-nav is not baseline-relative here — vue-router's targeted reactivity beats the naive full-re-render baseline — so it is read router-vs-router in the tables above.)",
    caveats: [
      "- **No cross-framework ranking** — each column is the same framework (Vue); the delta is router work. (Do NOT compare to the React/Preact cohorts.)",
      "- **vue-router 5** (bumped from v4 by Dependabot #1142) — v5 pulls no extra runtime into the measured app bundle, so the comparison is clean; the earlier v4-only note (pinia concern) is obsolete.",
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
    warningLine: "⚠️ Preliminary local numbers — directional, not a published verdict. Per-nav is **wall** (click→DOM settle — felt) + **task** (ΔTaskDuration — CPU), RME < 3% at n=50; the `total = script + Blink` metric was **retired** (#1451/#1452); `script`/`blink` are ⚠ **diagnostics** (V8-only, microtask-blind). **`nav-churn` navsPerSec is NOT comparable in this cohort** (real-router navigates synchronously; the others yield to frames) — read CPU/nav + heap.",
    cohortLine: "**Cohort:** `@real-router/solid` · `@solidjs/router` (the official Solid router) · `@tanstack/solid-router` — three full routers, like-for-like. Solid JSX apps (`vite-plugin-solid`, `dedupe: ['solid-js']`).",
    scopeNote: "**Scope — three full routers, like-for-like** (no minimalist exclusion needed). The honest picture, updated on the n=50 metric: **`@solidjs/router` is a remarkably lean router** — it leads cold-start, table-heap memory, and nav-churn retained heap. But **real-router leads far more than the earlier read suggested:** it wins nav-latency, param-nav, nested-switch, back-forward (~tie), link-build, active-links (~3.4×), **wide-config @1000 (~2.4×, @solidjs/router degrades with N — not flat at scale)** and **deep-config (every depth, ~1.4× @90)** — plus it brings the full pipeline (guards, validated search, data, scroll). One adapter soft-spot remains: **`@real-router/solid`'s deep-nesting `RouteView` cost (#1094 — ~linear after a bench-app fix removed an O(depth²) getter-chain artifact)**, though it still beats @solidjs/router's deep curve. **`@tanstack/solid-router` is generally heaviest** and cannot render 60+-deep nested routes (errors).",
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
    baselineReading: "**Reading:** over bare Solid, all three add little. real-router adds the least on links; @solidjs/router adds the least on cold-start. real-router's separation shows at scale (wide @1000, deep) and across per-nav, where it leads; @solidjs/router's shows at boot + retained memory. (Per-nav is ranked router-vs-router in the tables above — real-router leads nav-latency here.)",
    caveats: [
      "- **No cross-framework ranking** — each column is the same framework (Solid); the delta is router work. (Do NOT compare to the React/Vue cohorts.)",
      "- **`@tanstack/solid-router` deep-config is N/A** — it triggers its internal error boundary on 60+-segment deep-nested routes (renders depth 3/30, errors at 60/90). The `@tanstack/react-router` equivalent renders depth 90; a @tanstack/solid-router limitation, reproducible in-harness (`node cross-router/run.mjs deep-config tanstack solid`).",
      "- **`@real-router/solid` deep-nesting rises O(depth)** — the `RouteView` composition cost, tracked as #1094 (an adapter issue; the core matcher is flat-capable). real-router still wins deep here (0.56 vs @solidjs/router 0.81 @90). Real apps rarely nest past ~10.",
      "- **`nav-churn` navsPerSec is NOT comparable** — real-router navigates synchronously (~14.7k/s), @solidjs/router + tanstack yield to frames (~123/s). Read CPU/nav + retained heap.",
      "- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.",
      "- `wide`/`deep` are scaling sweeps — the per-size *curve* matters (here @solidjs/router degrades on wide @1000 while real-router stays flat; on deep both rise ~linearly, real-router lower).",
      "- **The `script` diagnostic sits near timer granularity** (Solid's per-nav script is sub-0.1 ms → inflated *relative* variance) — a diagnostic row, not the headline. At n=50 the headline **wall**/**task** and the sweeps sit within the RME gate; the findings (cold-start heap, wide/deep sweeps, table-heap, nav-latency wall) rest on stable signals (RME < ~3%).",
    ],
  },
  svelte: {
    cohortName: "Svelte cohort",
    engines: ["real-router", "sv-router", "mateo-router"],
    blurbs: SVELTE_BLURBS,
    baselineLabel: "bare Svelte",
    warningLine: "⚠️ Preliminary local numbers — directional, not a published verdict. Per-nav is **wall** (click→DOM settle — felt) + **task** (ΔTaskDuration — CPU), RME < 3% at n=50; the `total = script + Blink` metric was **retired** (#1451/#1452); `script`/`blink` are ⚠ **diagnostics** (V8-only, microtask-blind). `nav-churn` navsPerSec is settle-timed here — read CPU/nav + heap.",
    cohortLine: "**Cohort:** `@real-router/svelte` · `sv-router` (community Svelte-5-first router — **framework-native / Svelte-coupled**: borrows Svelte 5 runes for state, O(N) sort+scan matcher, boolean-blocker guards, plain `<a href>` links) · `@mateothegreat/svelte5-router` — Svelte 5 SFC apps (`vite-plugin-svelte`, `dedupe: ['svelte']`). **No `@tanstack/svelte-router` exists** (npm 404), so this cohort has no TanStack column; the popular `svelte-spa-router` (hash + regex) and `svelte-routing` are minimalist-class and excluded like `wouter`, and SvelteKit is framework-bundled (not a standalone router).",
    scopeNote: "**Scope — three full routers, like-for-like** (SvelteKit + hash/minimalist routers excluded). The honest split has **two axes plus a capability axis**. **Matcher scale** (`wide-config`): **real-router wins** — its segment trie stays flat @1000 (0.23) while sv-router degrades O(N) (0.475) and mateo-router floors high (0.52); the structural trie win holds in Svelte (as in React/Vue). **Per-nav render + memory** (cold-start, nav-latency, param-nav, nav-churn, table-heap, nested-switch, link-build): **sv-router wins** — a remarkably lean router (heap @10k 2.27 MB vs real-router 5.90; link-build 3.2 ms vs 12.1). But that leanness is **architectural, not just \"does less\"**: sv-router borrows Svelte 5 runes for reactivity (no state engine of its own), matches by O(N) sort+scan (not a trie), ships boolean-blocker guards (not real-router's `canDeactivate`/leave-approve lifecycle), and uses plain `<a href>` (not a reverse-matching `<Link>`). **The real axis is framework-native vs framework-agnostic:** sv-router is lean *because* it is Svelte-only and compile-friendly; real-router pays for carrying its own immutable state across 8 frameworks, an O(1) trie that wins at scale, and a full guard/search/scroll pipeline — and a Svelte dev choosing it gets the same router + pipeline in their React/Vue/etc. projects too. Not minimalist (it has nested layouts, data hooks, preload — unlike the excluded `svelte-spa-router`), just at the lean end of \"full\". **Capability**: **real-router is the ONLY full-pipeline router** (guards + validated search + data + scroll); sv-router covers data + guard, mateo-router guard only. real-router's adapter soft-spots: deep-nesting `RouteView` O(depth) (#1094) and a heavy `<Link>` (link-build 12.1 ms — `buildPath` + per-component instantiation, the residual after #1101's shared-selector fix). mateo-router renders depth 90 (no error boundary, unlike `@tanstack/solid-router`).",
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
    baselineReading: "**Reading:** over bare Svelte, sv-router's plain `<a href>` link-build sits ~at the floor; real-router adds the most on boot and on links (its `<Link>` reverse-matcher). real-router's separation is the matcher-scale win (wide @1000) + the full capability set, not the simple hot path. (Per-nav is ranked router-vs-router in the tables above.)",
    caveats: [
      "- **No cross-framework ranking** — each column is the same framework (Svelte); the delta is router work. (Do NOT compare to the React/Vue/Solid cohorts.)",
      "- **No `@tanstack/svelte-router`** — it does not exist (npm 404); the popular `svelte-spa-router` (hash + regex) and `svelte-routing` are minimalist-class (excluded like `wouter`), SvelteKit is framework-bundled. The cohort is real-router + the two community full routers that exist.",
      "- **Deep-nesting rises O(depth) (task 3.23 ms @90) — cause not yet decomposed for Svelte.** #1094's Solid research showed the analogous rise was ~60% a *Solid-specific* benchmark-app artifact (O(d²) lazy props) + adapter bugs (cache-key + subtree remount), reduced to ~1.1 ms @90 in prototype. The Svelte deep app was not analyzed the same way — treat the curve as directional pending a #1094-style decomposition. The core matcher is flat-capable.",
      "- **`@real-router/svelte` `<Link>` is heavy** — link-build 12.1 ms for 1000 links (vs bare-`<a>` 3.0, sv-router 3.3). #1101's shared active-name selector already removed the per-link subscription (14.6 → 12.0); the residual is `buildPath` per link (inherent) + per-`<Link>`-component instantiation. sv-router avoids both via a literal `<a href>` + a global click handler — a **structural** difference (component `<Link>` with a reverse-matcher vs a non-component `<a>`), not an addressable speed gap; read this row as structural (an N/A-class comparison), not a plain loss.",
      "- **`mateo-router` renders depth 90** — no internal error boundary at deep nesting (contrast the Solid cohort's `@tanstack/solid-router`, which errored past ~30).",
      "- **`mateo-router` `nested-switch` is N/A** — its `<Router>` renders through `{#key result.path.original}` (the full evaluated URL, per its `route.svelte.d.ts`), so a two-level app REMOUNTS the outer layout + inner router on every `/sec/a↔/sec/b` switch (full-remount, not ancestor-reuse). The scenario's reuse contract is inexpressible in this router, so the cell is SKIPPED (`run-all` `KNOWN_NA`) rather than published as a ranked number for less work (#1456). The other 13 nested cells are verified two-level.",
      "- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.",
      "- `wide`/`deep` are scaling sweeps — the per-size *curve* matters (wide separates real-router flat-trie from sv-router O(N); deep separates the adapters' composition cost).",
      "- **Per-nav `nav-latency` `script` medians are near timer granularity** (`_baseline` and sv-router per-nav script is sub-0.3 ms → inflated *relative* variance) — a diagnostic row; at n=50 the headline **wall**/**task** and the sweeps (wide/deep, table-heap, cold-start heap, link-build) rest on stable, larger-magnitude signals (RME < ~3%).",
    ],
  },
  angular: {
    cohortName: "Angular cohort",
    engines: ["real-router", "angular-router"],
    blurbs: ANGULAR_BLURBS,
    baselineLabel: "bare Angular",
    warningLine: "⚠️ Preliminary local numbers — directional, not a published verdict. Per-nav is **wall** (click→DOM settle — felt) + **task** (ΔTaskDuration — CPU); the `total = script + Blink` metric was **retired** (#1451/#1452); `script`/`blink` are ⚠ **diagnostics** (V8-only, microtask-blind). The route DOM now commits synchronously in the click task (#1466 — `RouteView` + `injectRoute` `detectChanges()`), so per-nav **wall ≈ task**. `nav-churn` navsPerSec is settle-timed. Angular 22 (zoneless), built via `@analogjs/vite-plugin-angular` (AOT).",
    cohortLine: "**Cohort:** `@real-router/angular` · `@angular/router` — Angular 22 zoneless standalone-component apps (`@analogjs/vite-plugin-angular`, AOT). `@angular/router` is Angular's official router — a standalone routing library you configure (`provideRouter`, like vue-router), NOT framework-bundled — and the ONLY serious Angular router (no third-party alternatives), so this is a two-engine cohort by ecosystem reality.",
    scopeNote: "**Scope — the two Angular full routers, like-for-like.** The honest picture on the n=50 metric: **`@angular/router` now holds only two axes** — cold-start (boots ~3× lighter — eager `@real-router/core` parse + init, #1106) and table-heap memory (3.68 vs 6.24 MB @10k — the O(1) segment trie's space-for-time cost). **real-router wins everything else — every scale sweep and every per-nav axis:** wide-config @1000 (**~12.9×** — @angular/router's matcher degrades with N, it is NOT a flat trie at scale), deep-config (**~3.3× @90**), search-param @50, nav-churn (CPU *and* retained heap), link-build, allocation (~15–35× leaner per nav), and — after the **#1466** sync-commit (`RouteView` + `injectRoute` / `injectRouteNode` call `detectChanges()` in the click task) — felt nav latency too (nav-latency / param-nav / nested-switch / active-links now ~3–13× wins, up from a loss or a tie). `@angular/router`'s one former per-nav edge — an imperative in-task `<router-outlet>` commit — is now matched. The two remaining losses are the inherent price of real-router's design (a full eager pipeline + O(1) matching) that *buys* the per-nav dominance; plus real-router adds validated search (capability) and the cross-framework single routing model.",
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
    baselineReading: "**Reading:** over bare Angular, `@angular/router` adds very little at boot (~0.3 ms); real-router adds ~4.3 ms at boot (upfront trie build). (Per-nav is not shown here: the naive manual click→pushState→signal baseline is heavier than either optimized router, so it is ranked router-vs-router in the tables above.)",
    caveats: [
      "- **No cross-framework ranking** — both columns are the same framework (Angular); the delta is router work.",
      "- **`@angular/router` is the only serious Angular router** — no third-party standalone alternatives exist (unlike React/Vue/Solid/Svelte), so this is a two-engine cohort by ecosystem reality, not exclusion.",
      "- **Deep-config is directional** — both rise O(depth), not decomposed for Angular. #1094's Solid research found the analogous rise was ~60% a Solid-specific bench-app artifact + adapter bugs (fix is `packages/solid`-only). Real apps rarely nest past ~10.",
      "- **real-router's heavier cold-start (~3× the boot script) is the upfront segment-trie build** (createRouter + start) — cross-cohort-consistent (~4.5–7 ms across solid/svelte/angular), the price of O(1) matching paid at boot; a design trade-off, not a defect.",
      "- **`@real-router/angular` `<Link>` link-build** — the shared active-name selector fast path already shipped (#1104, parallel to Svelte's #1101); the residual link-build cost is `buildPath` per link (inherent — React/Solid rr pay it and still win link-build) + Angular directive/effect instantiation, not a per-link subscription.",
      "- `real-router` includes `browser-plugin` (real History API) — part of its per-nav floor by contract.",
      "- `wide`/`deep` are scaling sweeps — the per-size *curve* matters (@angular/router degrades on wide @1000 while real-router stays flat; on deep both rise O(depth), real-router far lower).",
      "- **real-router's `nav-latency` `script` diagnostic is near timer granularity** (sub-0.6 ms → inflated *relative* variance) — a diagnostic row. At n=50 the headline **wall**/**task** + the sweeps (cold-start, wide/deep, table-heap, active-links, link-build) rest on stable, larger-magnitude signals (RME < ~3%). Per-nav wall now commits synchronously in-task (#1466 fixed), so it tracks the CPU cost.",
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

// --- blurb helpers (#1457 step 2): derived facts computed from results/ at gen-time so
// the numbers/ratios/winner in the prose can never drift from the tables. A blurb may be
// a literal string OR a function (h) => string that interpolates h.m()/h.kb()/h.x()/
// h.win(). Mechanism, causal "why", and issue-refs stay literal — only FACTS are live.
const DISPLAY = {
  "real-router": "real-router",
  "react-router": "react-router",
  "vue-router": "vue-router",
  "solid-router": "@solidjs/router",
  "angular-router": "@angular/router",
  "sv-router": "sv-router",
  "mateo-router": "mateo-router",
  tanstack: "tanstack",
};
const medOf = (scen, metric, engine) => {
  const v = read(scen, engine)?.metrics?.[metric]?.median;
  return typeof v === "number" ? v : null;
};
function blurbHelpers(defScen) {
  const disp = (e) => DISPLAY[e] ?? e;
  const m = (metric, engine, scen = defScen) => {
    const v = medOf(scen, metric, engine);
    return v == null ? "?" : fmt(v);
  };
  const kb = (metric, engine, scen = defScen) => {
    const v = medOf(scen, metric, engine);
    return v == null ? "?" : String(Math.round(v));
  };
  // magnitude of the gap between two engines' medians: "~2.8×" (≥1.8) or "~40%" (else)
  const x = (metric, a, b, scen = defScen) => {
    const va = medOf(scen, metric, a);
    const vb = medOf(scen, metric, b);
    if (va == null || vb == null || va === 0 || vb === 0) return "?";
    const r = Math.max(va, vb) / Math.min(va, vb);
    if (r >= 1.8) {
      const s = r.toFixed(1);
      return `~${s.endsWith(".0") ? s.slice(0, -2) : s}×`;
    }
    return `~${Math.round((r - 1) * 100)}%`;
  };
  const win = (metric, scen = defScen) => {
    let best = null;
    let bestE = null;
    for (const e of ENGINES) {
      const v = medOf(scen, metric, e);
      if (v != null && (best == null || v < best)) {
        best = v;
        bestE = e;
      }
    }
    return bestE ? disp(bestE) : "?";
  };
  const n = () => `n=${read(defScen, "real-router")?.runs ?? "?"}`;
  return { m, kb, x, win, disp, n };
}

function metaLine() {
  const cells = [];
  for (const scenario of SCENARIOS) {
    for (const engine of ENGINES) {
      const data = read(scenario.id, engine);
      if (data) cells.push({ scenario: scenario.id, engine, data });
    }
  }
  if (cells.length === 0) return "(no results yet)";
  // Cohort-coherence check (#1459): a mixed-epoch REPORT — some cells measured before
  // a fix, some after — otherwise regenerates with no trace. Warn on disagreeing
  // env.commit or a wide date span (the 07-11 vue matrix silently measured pre-#1424).
  const commits = new Set(
    cells.map((c) => c.data.env?.commit).filter(Boolean),
  );
  if (commits.size > 1) {
    console.warn(
      `report.mjs: ${FRAMEWORK} cohort spans ${commits.size} commits [${[...commits].join(", ")}] — MIXED-EPOCH results (a re-baseline should measure ONE commit); e.g. ${cells
        .filter((c) => c.data.env?.commit)
        .slice(0, 5)
        .map((c) => `${c.scenario}×${c.engine}@${c.data.env.commit}`)
        .join(", ")}…`,
    );
  }
  const dates = cells
    .map((c) => c.data.env?.date)
    .filter(Boolean)
    .sort();
  if (dates.length > 1) {
    const spanH = (new Date(dates.at(-1)) - new Date(dates[0])) / 3.6e6;
    if (spanH > 6) {
      console.warn(
        `report.mjs: ${FRAMEWORK} cohort dates span ${spanH.toFixed(1)} h (${dates[0]} … ${dates.at(-1)}) — check for a mixed-session matrix.`,
      );
    }
  }
  const { runs, warmup, throttle, env } = cells[0].data;
  const commitStr = env?.commit ? ` · ${env.commit}${env.dirty ? "-dirty" : ""}` : "";
  return `runs ${runs} · warmup ${warmup} · throttle ${throttle} · ${env?.date ?? "?"}${commitStr}`;
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
lines.push(`**Run:** ${metaLine()} · Apple M3 Pro · numbers are **median** (winner per row **bold**; a **⚖** row = the top-2 medians' 95% CIs overlap, so no winner is bolded — not statistically separable, #1460).`);
lines.push("");
lines.push(cfg.warningLine);
lines.push("");

for (const scenario of SCENARIOS) {
  let blurb = cfg.blurbs[scenario.id];
  if (!blurb) continue;
  if (typeof blurb === "function") blurb = blurb(blurbHelpers(scenario.id));
  lines.push(`## ${scenario.title} — \`${scenario.id}\``);
  lines.push("");
  lines.push(blurb);
  lines.push("");
  lines.push(`| metric | ${ENGINES.join(" | ")} |`);
  lines.push(`|---|${ENGINES.map(() => "---").join("|")}|`);
  for (const [key, label, unit, dir] of scenario.rows) {
    const cells = ENGINES.map((engine) => {
      const m = read(scenario.id, engine)?.metrics?.[key];
      return m?.median == null
        ? null
        : { v: m.median, half: (Math.abs(m.median) * (m.rme ?? 0)) / 100 };
    });
    const present = cells.filter(Boolean);
    const best =
      present.length === 0
        ? null
        : dir === "higher"
          ? Math.max(...present.map((c) => c.v))
          : Math.min(...present.map((c) => c.v));
    const bestCell = present.find((c) => c.v === best);
    // Near-tie: a runner-up's 95% CI overlaps the winner's → the "win" is not
    // statistically established (S4/#1460) → do NOT bold any winner for this row.
    const nearTie =
      bestCell != null &&
      present.some(
        (c) => c !== bestCell && Math.abs(c.v - best) <= c.half + bestCell.half,
      );
    const rendered = cells.map((c) =>
      c == null ? "—" : c.v === best && !nearTie ? `**${fmt(c.v)}**` : fmt(c.v),
    );
    lines.push(`| ${label} (${unit})${nearTie ? " ⚖" : ""} | ${rendered.join(" | ")} |`);
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

// Only scenarios where `_baseline` is a GENUINE floor — the router adds real,
// baseline-independent work over the bare framework (parse/init at boot;
// reverse-match per link). Per-nav (`nav-latency`) is deliberately EXCLUDED: the
// baseline's naive manual `pushState` + full-re-render is not a lower bound for
// navigation — an optimized router beats it, so Δ goes negative (vue-router,
// sv-router, @angular/router) and "overhead over baseline" is a strawman there.
// Per-nav is ranked router-vs-router in the tables above (#1326).
const BASELINE_ROWS = [
  { scenario: "cold-start", metric: "scriptDurationMs", label: "cold-start script (ms)" },
  { scenario: "cold-start", metric: "jsHeapMB", label: "cold-start heap retained (MB)" },
  { scenario: "link-build", metric: "mountMs", label: "link-build mount (ms)" },
];
if (read("cold-start", "_baseline")) {
  lines.push(`## Router overhead over ${cfg.baselineLabel} (\`_baseline\`)`);
  lines.push("");
  lines.push(cfg.baselineNote);
  lines.push("");
  lines.push(`| metric | ${cfg.baselineLabel} | ${ENGINES.join(" | ")} |`);
  lines.push(`|---|---|${ENGINES.map(() => "---").join("|")}|`);
  for (const row of BASELINE_ROWS) {
    const baseCell = read(row.scenario, "_baseline");
    const base = baseCell?.metrics?.[row.metric]?.median;
    if (base == null) {
      // Loud skip (#1458): a results file that EXISTS but lacks the requested key is
      // schema drift (a renamed metric), not a genuinely missing cell — warn so the
      // row can't silently vanish (as link-build's did when scriptMs→mountMs).
      if (baseCell && !(row.metric in (baseCell.metrics ?? {}))) {
        console.warn(
          `report.mjs: BASELINE_ROWS "${row.scenario}" wants metric "${row.metric}", but the _baseline cell has [${Object.keys(baseCell.metrics ?? {}).join(", ")}] — schema drift, row DROPPED. Fix BASELINE_ROWS or re-measure.`,
        );
      }
      continue;
    }
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

const outFile = `REPORT-${FRAMEWORK}.md`;
writeFileSync(`${here}/${outFile}`, `${lines.join("\n")}\n`);
console.log(`Wrote ${here}/${outFile}`);
