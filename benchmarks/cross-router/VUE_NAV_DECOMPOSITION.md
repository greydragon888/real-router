# Vue Per-Navigation Cost — Full Decomposition

Why does `@real-router/vue` cost more main-thread script per navigation than
`vue-router` in the cross-router benchmark, and **which layer** is responsible?
This document records the complete investigation — every measurement, two
self-corrections of wrong intermediate conclusions, and the final answer.

**TL;DR.** The per-nav gap is **~70 % the `browser-plugin`'s real-History-API
work** (`0.108 ms/nav`, ~15× `vue-router`'s history layer), **not** the Vue
adapter, **not** the FSM core / sources layer (~1 µs, 1 %), and **not** extra
component re-renders (both render exactly **1** component per nav). Drilling into
the plugin, its JS is ~1 µs (no hotspot — `buildPath` etc. are sub-µs); the
**concrete lever is the per-nav `location.hash` read** (`getDecodedHash`, for #532
hash support) — it forces a *synchronous history commit* costing **~0.04 ms/nav**
(~25 % of the whole Vue per-nav), which `vue-router` avoids by never reading
`location` per nav. **Skip/cache it when no hash routing is in use** (a
framework-agnostic win — `browser-plugin` is shared by every cohort). The residual
~0.06 ms is the native `pushState` primitive — not real-router JS.

Measured on Apple M3 Pro, Chromium via Playwright + CDP, 2026-06-28. Absolute
numbers are machine-dependent; the **decomposition** (which layer dominates) is
the durable result.

> **⚠️ Major correction (CDP Tracing, 2026-06-28) — read this first.** The per-nav
> numbers below are CDP **`ScriptDuration`**, which measures **V8/JS only**. A later
> CDP **Tracing** capture showed the *dominant* per-nav cost — Blink's
> `FrameLoader::updateForSameDocumentNavigation` (the `history.pushState`
> same-document-navigation work) — **NOT counted by `ScriptDuration`** — and
> **vue-router triggers it 2×/nav** (`replaceState`+`pushState`) vs real-router's
> **1×**. Per nav (CDP-traced, harness-reported, 15 runs): Blink ≈ **real-router
> 0.18 ms (1×) vs vue-router 0.30 ms (2×)** — vue-router pays history ~twice. So the
> headline
> **"~4× / history dominates / browser-plugin is the lever" is a metric artifact**:
> counting Blink, the **total** per-nav is **PARITY — all ~0.32 ms (real-router
> 0.317 ≈ vue-router 0.327 ≈ tanstack 0.314, 15 runs)** — vue-router's lean script is
> offset by its 2× Blink history. The small residual is the **Vue-runtime render**
> the nav triggers (see *Navigate-pipeline V8 dig* below — emit + sources are
> <1 µs, exonerated) — **not** the Vue adapter (a lean native-`computed` Link,
> mirroring vue-router, does **not** close it — 0.18 ≈ full Link), **not** history
> (vue-router pays *more*),
> **not** the core (pure-Node: 0.79 µs, lighter than vue-router's 2.38 µs). §2f's
> `location.hash` finding still holds as a small *script-side* win (#1019); the
> "history is 70%" framing was `ScriptDuration`-biased (it counted the plugin's
> script around `pushState`, not the equal Blink cost). Sections below are kept as
> the investigation record.

---

## 0. The question

The fair steady-state `nav-latency` metric (see §1) gives, per cohort (ms/nav):

| cohort | real-router | competitor | competitor |
| --- | --- | --- | --- |
| React  | **0.377** 🥇 | react-router 0.584 | tanstack 0.506 |
| Preact | 0.191 | preact-iso **0.153** | preact-router 0.265 |
| Vue    | 0.183 | vue-router **0.043** | tanstack 0.170 |

real-router **wins** React, is competitive in Preact, but is ~4× `vue-router` in
Vue. Note real-router's *own* Vue number (0.183) is **lower than its React
number** (0.377) — it is not "slow in Vue". The question is why `vue-router` is
so exceptionally light, and whether the gap is a fixable adapter cost or an
intrinsic architectural one.

---

## 1. First: the metric had to be fixed (self-correction #1)

The original `nav-latency` measured `ScriptDuration` over a **single** click→render
window. That systematically favors **async** routers: real-router runs its
transition pipeline **synchronously** (all in-window), while `vue-router` /
`tanstack` / `react-router` navigate **asynchronously** (work spills past the
window). An earlier CPU-profile-based read concluded "the Vue gap is just a
sync-vs-async artifact, totals are at parity" — **this was wrong** (it was built
on an unreliable sampled profile; see §6).

**Fix:** drive **N full navigations** (each completes before the next, so async
work is counted, not canceled) and divide total `ScriptDuration` by N. This is
fair to synchronous *and* async routers. Re-measuring with the fair metric
**confirmed the gap is real** (Vue: 0.183 vs 0.043), not an artifact. Driver:
`cross-router/scenarios/nav-latency.mjs`.

---

## 2. The decomposition ladder

All rows below are the **fair steady-state** metric (ms/nav, browser, median).
Two minimal apps strip both routers to **1 `useRoute` subscriber + programmatic
nav, no `<Link>`/`<RouteView>`**, isolating the core+subscription path.

### 2a. Components are not the gap

| | full (RouteView + 2 Link + useRoute) | min (1 useRoute, no Link/View) |
| --- | --- | --- |
| real-router | 0.162 | **0.151** |
| vue-router  | 0.032 | **0.026** |

Stripping `RouteView` + 2 `Link` saved only ~7 %. The gap (≈5.8× at minimum)
lives in the **core/subscription path**, not the components.

### 2b. FSM core + sources layer ≈ 1 µs (1 %) — and real-router's core is *leaner*

Pure-Node (`@real-router/core` + the exact `createRouteSource` subscription
`setupRouteProvision` wires for `useRoute`), no Vue / DOM / history, 20 000 navs:

| | µs/nav |
| --- | --- |
| real-router **FSM core** (`navigate` → transition + immutable state) | **0.79** |
| real-router **core + sources** (the `useRoute` path) | **0.90** (sources adds 0.11) |
| vue-router **core** (`resolve` + ref set) | **2.38** |

The framework-agnostic machinery is **~1 µs**, i.e. **1 %** of the 0.151 ms
browser cost — and real-router's core is **lighter** than vue-router's
(0.90 vs 2.38 µs). **The cross-framework architecture / nanostores sources layer
is NOT the cost** (self-correction #2 — an intermediate conclusion had blamed
the sources layer; the Node split refuted it).

### 2c. Re-renders: exactly 1 component/nav — for both

A global `beforeUpdate` mixin counts **every** component update; named counters
on a `Root → Shell → View` chain (Shell reads no route → detects a forced
`RouterProvider` slot re-render):

| | total updates/nav | Root | Shell | View |
| --- | --- | --- | --- | --- |
| real-router | **1.00** | 0.00 | 0.00 | 1.00 |
| vue-router  | **1.00** | 0.00 | 0.00 | 1.00 |

**Identical.** `RouterProvider` does **not** force extra renders; there are no
hidden internal adapter components re-rendering. Both routers re-render exactly
the one subscriber that reads the route. So the gap is **not** render *count*.

### 2d. History API is the gap (the answer)

Each min app measured with **real** history vs **memory** history (no
`pushState`); the difference is the real-History-API cost:

| | REAL history | MEMORY history | **history layer** | **adapter bridge + render + DOM** |
| --- | --- | --- | --- | --- |
| **real-router** (browser-plugin) | 0.155 | 0.047 | **0.108 (70 %)** | 0.047 |
| **vue-router** (createWebHistory) | 0.038 | 0.031 | **0.007** | 0.031 |

- **real-router's per-nav is ~70 % the `browser-plugin`'s History-API work**
  (`0.108 ms`), **~15× `vue-router`'s history layer** (`0.007 ms`).
- **Without history, the adapter bridge + render + DOM are close**: real-router
  `0.047` vs vue-router `0.031` (~1.5×, not 6×).
- Raw `history.pushState` is cheap (vue-router's *entire* history layer is 7 µs),
  so real-router's `0.108 ms` is the **plugin's per-nav logic around** the API
  (URL construction, location sync, history-state handling, popstate
  bookkeeping), not the browser primitive itself.

### 2e. Inside the browser-plugin: the JS is already ~1 µs — the cost is native pushState

A CPU profile of the real-router min app with **readable names** (`@real-router/*`
resolved to `src` via the `@real-router/internal-source` condition, `minify:false`),
real-router driven synchronously (microtask-paced) so samples are mostly busy:

| frame (self-time) | µs/nav |
| --- | --- |
| `pushState` (native) | ~21 (+ more in native/`(program)`) |
| `buildPath` | 0.075 |
| `getHash` | 0.233 |
| `write` (context-claim) | 0.257 |
| `setStateMetaParams` | 0.139 |
| `navigate` | 0.257 |

**No JS hotspot.** `buildPath` (reverse URL) is cheap — the path is already on the
state, no reverse-match needed; context-claim writes are sub-µs. The dominant
attributed cost is the **native `history.pushState`** call; the plugin's own logic
is ~1 µs total. So there is no `<Link>`-`shallowEqual`-style JS micro-optimization
hiding in the plugin's code.

### 2f. The lever: the per-nav `location.hash` read forces a synchronous history commit

The browser-plugin reads `location.hash` (`getDecodedHash`, `factory.ts:197`) on
**every** transition (hash-routing support, #532); `vue-router` never reads
`location` per nav. Reading a `location.*` property in a navigation stream forces
the browser to **synchronously commit the pending `pushState`** (so `location`
reflects the new URL) instead of letting it batch. Isolated A/B (bare Vue, surgical
1-component render + real `history.pushState`, fair steady-state, median of 6):

| | ms/nav |
| --- | --- |
| `pushState` + render | 0.112 |
| `pushState` + render + `location.hash` read | 0.153 |
| **cost of the `location.hash` read** | **+0.041 (~37 %)** |

**This is the lever** — ≈ 0.04 ms/nav (~38 % of the browser-plugin's 0.108 ms gap)
is the forced history commit triggered by the per-nav `location.hash` read. When
the app uses no hash routing (the common case) the read is wasted — the hash is
always `""`. **Candidate fix:** cache `hash = ""` and skip `getDecodedHash` until a
hash actually appears (or read lazily, only when a hash-aware consumer needs it),
eliminating the per-nav forced commit. Must preserve #532 hash semantics (the read
exists to detect anchor-clicks / manual `location.hash` changes — a lazy/observed
read can keep that). The **residual** (~0.06 ms) is the native `pushState` itself,
larger than vue-router's measured history layer for reasons not isolated here
(vue-router's history abstraction may batch/defer differently); that part is the
browser primitive, not real-router JS.

### 2g. Implemented & measured (#1019)

The fix landed (cache the fragment in the plugin + an optional `hashchange`
listener for external changes; commit `a5f4715e`). A **drift-cancelling
interleaved A/B** — same min app, the *only* difference is `factory.ts` (cached
vs per-nav `location.hash` read), built into two dists and measured round-robin
(`old,new,old,…`) so thermal/warmup drift hits both equally; median of 11 runs,
100 navs each:

| | ms/nav (median) | spread |
| --- | --- | --- |
| OLD (per-nav `location.hash` read) | 0.128 | [0.102 – 0.176] |
| NEW (cached fragment) | 0.112 | [0.102 – 0.147] |
| **Δ fix** | **−0.016 (~13 %, 1.14×)** | NEW also tighter (no forced-commit jitter) |

**Methodology note:** a naïve sequential A/B was useless here — in both directions
the *first-measured* variant won (machine warms over the run), so order, not the
fix, decided the result. Interleaving cancels the monotonic drift; the 0.016
signal then reproduces cleanly.

The in-context saving (**0.016**) is smaller than §2f's isolated **0.041** upper
bound because in real-router's flow the `location.hash` read is *spaced* from the
prior `pushState` (render + sources work between them), so the browser has partly
settled the pending commit — the forced-commit penalty is lower than back-to-back.
The saving is one fewer `location.hash` read per nav → **constant across app size**
(≈ 9 % of the full 0.183 ms Vue nav; it narrows the gap to vue-router from 0.140 to
~0.124) and **framework-agnostic** — the same ~0.016 ms/nav applies to every cohort
(React/Preact/Solid/Svelte/Angular), since `browser-plugin` is shared.

---

## 3. Conclusion — which layer, and is it fixable

Stacking the layers of real-router's `~0.155 ms/nav` (Vue, base app):

| layer | cost/nav | share | fixable? |
| --- | --- | --- | --- |
| FSM core + immutable state + sources | ~0.001 ms | ~1 % | no — already leaner than vue-router's core |
| component re-renders | 1 render (same as vue-router) | — | no — minimal already |
| Vue adapter bridge + render + DOM | ~0.047 ms (vs vue-router 0.031) | ~30 % | marginal (~1.5×) — small, idiomatic Vue render |
| `browser-plugin` — per-nav `location.hash` read (§2f) | ~0.041 ms | ~25 % | **yes — skip/cache when no hash routing** |
| `browser-plugin` — native `history.pushState` | ~0.067 ms | ~45 % | no — browser primitive |

`vue-router` is "exceptional" **not** because of fine-grained reactivity, a
leaner core, or fewer renders — its core is *heavier* and it renders the *same*
one component. It is exceptional because its **history layer is ~15× cheaper per
navigation**. real-router's `browser-plugin` does substantial per-nav work
beyond the raw `pushState`.

**Net:** the optimization target for Vue (and every cohort — `browser-plugin` is
framework-agnostic) is the **`browser-plugin`'s per-navigation cost**, not the
Vue adapter, core, or sources layer. Even so, real-router's absolute Vue nav
(0.18 ms) is well under one frame — there is no real UX deficit; this is a
benchmark-fairness + optimization-targeting result, not a product defect.

### The lever (found — §2e–2f)

Profiling *inside* `browser-plugin` with readable names showed its JS is ~1 µs —
**no** `buildPath` / `new URL()` / serialization hotspot (the path is pre-computed
on the state). The concrete lever is the **per-nav `location.hash` read**
(`getDecodedHash`, `factory.ts:197`, present for #532 hash support): reading
`location` in a navigation stream forces a **synchronous history commit** of the
pending `pushState`, costing **~0.04 ms/nav** (~38 % of the browser-plugin gap,
~25 % of the whole Vue per-nav — measured in isolation, §2f). `vue-router` never
reads `location` per nav, so its `pushState` stays batched/cheap.

**Fix candidate:** skip / cache `hash = ""` and only call `getDecodedHash` when a
hash actually appears (or read lazily on demand), preserving #532 semantics
(anchor-click / manual `location.hash` detection). This is a **framework-agnostic
win** — `browser-plugin` is shared by every cohort (React/Preact/Vue/…), so the
saving applies everywhere, not just Vue. The residual ~0.06 ms is the native
`pushState` primitive — not real-router JS, not optimizable from user-land. (cf.
the `<Link>` `shallowEqual` win in `vs-tanstack/ADAPTER_PERFORMANCE.md` — same
shape of finding: a per-nav read/derivation that an idiomatic app doesn't need.)

---

## 4. Methodology lessons (recorded so the next investigation avoids them)

1. **A sampled CPU profile with rAF-pacing + manual name/url bucketing is
   unreliable for async routers** — samples leak into `(idle)`/`(program)`/driver
   frames, and a bucketing pass over a Vite-bundled chunk mis-attributes cost. An
   early profile here over-counted `vue-router` ~8× (345 µs "busy" vs the real
   43 µs `ScriptDuration`). **Trust the `ScriptDuration` metric in a steady-state
   loop; use the profile only to generate hypotheses, never as the verdict.**
2. **A single-nav `ScriptDuration` window favors synchronous-pipeline routers'
   competitors** (async work spills out). Measure N full navigations ÷ N.
3. **Localize by subtraction, not by reading frames:** pure-Node core, full-vs-min
   apps, render counters, real-vs-memory history — each isolates one layer with an
   A/B the profiler could not give reliably.
4. Two intermediate conclusions in this very investigation were wrong
   ("sync-vs-async artifact"; "the sources layer is the cost"). Both were caught
   by going one measurement deeper. **Don't ship a conclusion from one
   measurement without a cross-check.**

---

## 5. Reproduction

The four probes were standalone scripts (`cross-router/_nav*.mjs`, deleted after
running) built on the same harness:

- **fair metric** — `cross-router/scenarios/nav-latency.mjs` (N navs ÷ N).
- **full-vs-min ladder** — two stripped apps (`h()`-based, 1 `useRoute`
  subscriber, programmatic nav), measured with the fair metric.
- **pure-Node core** — `createRouter().navigate()` ± `createRouteSource(...).
  subscribe()` (the exact `setupRouteProvision` path), `vue-router` `push()` on a
  non-mounted `createApp().use(router)`; await each, time ÷ N.
- **render count** — global `app.mixin({ beforeUpdate })` + named render counters
  on `Root → Shell → View`.
- **history split** — each min app with `browser-plugin`/`createWebHistory`
  (real) vs `memory-plugin`/`createMemoryHistory` (no `pushState`); difference =
  history layer.

## Navigate-pipeline V8 dig (Node) — emit + sources bridge exonerated

The Correction attributed the ~1.5× residual to real-router's *navigate script
(emit + sources bridge)*. A pure-Node decomposition (no browser, no Vue render;
median of 5 × 20 000 navs) shows that pipeline is **~1 µs/nav total**:

| layer | µs/nav |
| --- | --- |
| A `core.navigate` (emit → 0 subscribers) | 0.59 |
| B + `router.subscribe` (emit → 1) | 0.96 (+0.36) |
| C + `createRouteSource().subscribe` (the **sources bridge**) | 0.69 (≈ B — noise) |
| D + `setupRouteProvision` (getSnapshot + 2 `shallowRef` sets) | 0.85 |

The whole navigate pipeline (core + emit + sources bridge + adapter refs) is
**0.6–1 µs** — *lighter* than vue-router's core (~2.38 µs) and **three orders of
magnitude** below the ~70 µs browser residual. **So emit and the sources bridge
are NOT the residual** — they were the named suspects, and they're exonerated. The
browser residual is the **Vue-runtime render** the nav triggers (reactivity
track/trigger + the *one* component re-render + VDOM patch) plus the `pushState`
JS-boundary — framework-level work, ~common to both routers (both set one
`shallowRef` → re-render one component), **not** real-router's navigate code. Net:
there is no wasted work in our navigate pipeline to trim; the residual lives in the
Vue render layer (shared with vue-router) and residual metric confounds.

See also `benchmarks/vs-tanstack/ADAPTER_PERFORMANCE.md` (the *wide* component
workload, where Vue runtime's reactivity+VDOM "double tax" dominates — a
different regime from this small app-routing nav, where History dominates).
