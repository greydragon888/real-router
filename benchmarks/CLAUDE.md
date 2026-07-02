# router-benchmarks

> Performance comparison: real-router vs router5, router6, and TanStack Router

## Structure

```
benchmarks/
├── core/                          # Mitata micro-benchmarks (real-router vs router5 vs router6)
│   ├── index.ts                   # Entry point, JIT warmup, section runner
│   ├── isolated-anomalies.ts      # Isolated measure() for IC megamorphism workaround
│   ├── isolated-navigate.ts       # Isolated navigate() measurements
│   ├── helpers/                   # Router adapter, factory, constants
│   ├── 01-navigation-basic/
│   ├── 02-path-operations/
│   ├── 03-current-state/
│   ├── 04-stress-testing/
│   ├── .bench/                    # JSON results per router/section (gitignored)
│   └── .bench-results/            # Text logs from bench-compare.sh (gitignored)
├── vs-tanstack/                   # Vitest bench: real-router vs TanStack Router (React/Vue/Solid)
│   ├── shared/                    # jsdom, perf-utils, setup-helpers, memory-utils, vitest.setup
│   ├── client-nav/               # scenario: navigation-loop throughput (speed/flame/memory)
│   ├── navigation-churn/         # memory churn: per-navigation retention
│   ├── unique-location-churn/    # memory churn: unbounded match/history caches (unique URLs)
│   ├── mount-unmount/            # memory churn: router collectable after dispose (waits render commit)
│   ├── interrupted-navigations/  # memory churn: superseded navs (slow canActivate + fast interrupt)
│   ├── loader-data-retention/    # memory churn: departed-route context payload (claimContextNamespace)
│   │   ├── real-router/{react,vue,solid}/   # per app-set: app · setup · speed.{memory,flame} · vite.config (+tsconfig for solid)
│   │   └── tanstack/{react,vue,solid}/
│   │   #  preload-churn NOT ported — fake-analogy (preload-plugin = transport+State-LRU, not data-cache)
│   ├── bundle-size/              # competitive client-JS size — NOT memory
│   │   ├── _baseline/{react,vue,solid}/   # framework runtime only (no router) — subtracted → router-attributable size
│   │   ├── {real-router,tanstack}/{react,vue,solid}/{minimal,full}/  # index.html · main · vite.config (app build, no plugins → 1:1 adapter surface)
│   │   └── measure.mjs           # build all (vite), then `node …/measure.mjs` → router-attributable (total − baseline), gzip primary
│   ├── run.mjs                    # runner: <scenario> <engine> <framework> <mode>
│   ├── tsconfig.json · tsconfig.solid.json (solid aggregate) · vitest.config.ts
│   └── .bench-results/            # Text logs from bench-compare-vs-tanstack.sh (gitignored)
├── cross-router/                  # REAL browser (Playwright + CDP): ALL competitors, per-cohort (no cross-framework rank)
│   ├── apps/<framework>/<engine>/ # per-cohort shells (engine-agnostic, only routing differs): base + {wide,deep,nested,links,params,tableheap,linkbuild} variants + feature demos {data,search,guard}
│   │   #  react cohort: real-router · react-router (v8 Data mode) · tanstack — wouter EXCLUDED (minimalist, different class; REPORT.md Scope) · _baseline = bare React floor
│   │   #  preact cohort REMOVED (2026-06-29) — no full-router competitor (preact-iso = minimalist/recommended, preact-router = deprecated); no honest competitive perf comparison. apps/preact/ deleted (git-recoverable); @real-router/preact adapter still ships + is tested
│   │   #  vue cohort: real-router · vue-router@4 (Vue 3 official; v5 pulls pinia — excluded) · @tanstack/vue-router — three FULL routers, like-for-like (REPORT-vue.md); Vue JSX apps (@vitejs/plugin-vue-jsx, all dedupe ['vue']) · _baseline = bare Vue floor
│   │   #  solid cohort: real-router · @solidjs/router (official) · @tanstack/solid-router — three FULL routers, like-for-like (REPORT-solid.md); Solid JSX apps (vite-plugin-solid, dedupe ['solid-js']) · _baseline = bare Solid floor. Findings: @solidjs/router lean (leads most raw metrics); rr wins nav-latency/link-build/active-links; rr deep-nesting O(depth) → #1094; @tanstack/solid-router deep N/A (errors on 60+ nesting)
│   │   #  svelte cohort: real-router · sv-router (community Svelte-5 full router) · @mateothegreat/svelte5-router (engine dir `mateo-router`) — three FULL routers (NO @tanstack/svelte-router — npm 404; svelte-spa-router/svelte-routing minimalist-excluded like wouter; SvelteKit framework-bundled); REPORT-svelte.md; Svelte 5 SFC apps (@sveltejs/vite-plugin-svelte 6.2.4 [7.x needs vite 8], dedupe ['svelte']) · _baseline = bare Svelte. Findings: rr WINS wide@1000 (trie flat 0.44 vs sv-router O(N) 0.80) + active-links + ONLY full-capability (guard/search/data/scroll); sv-router lean (memory 2.26@10k, link-build, most per-nav); rr deep #1094 (directional — #1094 research: 60% Solid-bench-artifact) + heavy <Link> (link-build 14.6 vs baseline 3.0)
│   │   #  angular cohort: real-router · @angular/router (Angular's OFFICIAL router — standalone lib configured via provideRouter like vue-router, NOT framework-bundled; ONLY serious Angular router, no 3rd-party → 2-engine cohort by ecosystem reality); REPORT-angular.md; Angular 22 ZONELESS standalone-component apps (@analogjs/vite-plugin-angular AOT + @angular/build peer) · _baseline = bare Angular. Findings: @angular/router WINS most (boot ~3× lighter, nav/param, wide FLAT+lean 0.33, memory 3.67@10k, churn-CPU, nested); rr WINS only active-links (cached active-source) + link-build (14.3<18.05); deep ~wash (both O(depth)); capability rr 4/4 vs angular-router 3/4 (only validated-search edge). TOUGHEST cohort for rr — @angular/router objectively excellent
│   ├── scenarios/*.mjs            # 8 engine-agnostic drivers: cold-start · nav-latency · param-nav · wide-config ·
│   │   #  deep-config · nav-churn · active-links · nested-switch  (sweeps emit per-size @N/@D keys)
│   ├── harness/                   # cdp.mjs (CDPSession: Performance.getMetrics + HeapProfiler) · stats.mjs (median/p95/RME) · measure.mjs · report.mjs
│   ├── run.mjs · run-all.mjs      # one run / full matrix → results/<fw>/<scenario>/<engine>.json; VARIANT map routes big-table scenarios to <engine>/<variant>/
│   ├── results/ (gitignored) · REPORT.md (react) + REPORT-vue.md + REPORT-solid.md + REPORT-svelte.md + REPORT-angular.md (committed, curated)
│   └── tsconfig.json (react-jsx; excludes apps/vue + apps/solid) · apps/vue/tsconfig.json (jsxImportSource vue) · apps/solid/tsconfig.json (jsxImportSource solid-js) · apps/svelte: NO tsconfig (SFC) · apps/angular/<engine>/{tsconfig,tsconfig.app}.json (per-app; Angular AOT via analog, strictTemplates type-checks at build) · .gitignore
│      #  type-check (ungated, manual/IDE): tsc -p cross-router/tsconfig.json (react) · -p cross-router/apps/vue/tsconfig.json (vue) · -p cross-router/apps/solid/tsconfig.json (solid). NB: IDE tsserver mis-applies react-jsx to solid files (flood of false "React.JSX / --jsx" errors) — the `tsc -p apps/solid` run is AUTHORITATIVE (0 errors); ignore the IDE noise for solid apps. Svelte apps have NO tsc step — `vite build` (svelte plugin) is the check; verify via `run.mjs <scenario> <engine> svelte`. Angular apps: NO separate tsc — the AOT build (@analogjs/vite-plugin-angular, strictTemplates) type-checks; IDE shows FALSE "tslib / Cannot find ./pages" noise (stale tsserver, not the AOT resolver) — authoritative is `run.mjs <scenario> <engine> angular`
├── bench-compare.sh               # Core comparison script (sudo, thermal monitoring)
├── bench-compare-vs-tanstack.sh   # TanStack comparison script (sudo, thermal monitoring)
├── compare.mjs                    # Analyze and compare core/.bench/ results
└── check-rme.sh                   # Validate RME stability across core/.bench/ JSON files
```

## External Sources

- **router6 source:** `/Users/olegivanov/WebstormProjects/router6/packages/router6`

## Machine

- **Model:** Mac15,7 (MacBook Pro)
- **Chip:** Apple M3 Pro
- **OS:** macOS 25B78

## Key Commands

### Core benchmarks (router5 / router6 / real-router)

```bash
pnpm bench              # real-router (section controlled by BENCH_SECTIONS)
pnpm bench:router5      # router5
pnpm bench:router6      # router6
pnpm bench:current      # build real-router first, then bench

# Full comparison (requires sudo)
sudo ./bench-compare.sh
sudo ./bench-compare.sh 1        # Section 1 only
sudo ./bench-compare.sh 1 8      # Multiple sections
./bench-compare.sh --help

# Isolated measurements (IC megamorphism workaround for Section 7)
BENCH_ROUTER=real-router npx tsx core/isolated-anomalies.ts
BENCH_ROUTER=router6 npx tsx core/isolated-anomalies.ts
BENCH_ROUTER=real-router npx tsx core/isolated-navigate.ts

# Analyze results
node compare.mjs
./check-rme.sh
```

### vs-tanstack benchmarks (real-router vs TanStack Router)

Runner convention: `node vs-tanstack/run.mjs <scenario> <engine> <framework> <mode>`
(scenario: `client-nav` · engine: `real-router`|`tanstack` · framework: `react`|`vue`|`solid` · mode: `build`|`speed`|`flame`|`memory`).
Invoke via pnpm so `node_modules/.bin` is on PATH; pass runner args after `--`.

```bash
# React speed (shortcuts)
pnpm bench:vs-tanstack:real-router
pnpm bench:vs-tanstack:tanstack

# Any combination via the runner
pnpm bench:vs-tanstack -- client-nav real-router vue speed
pnpm bench:vs-tanstack -- client-nav tanstack solid speed

# Flame graph
pnpm bench:vs-tanstack -- client-nav real-router react flame

# Memory profiling (--expose-gc auto)
pnpm bench:vs-tanstack -- client-nav real-router react memory

# Full comparison (requires sudo)
sudo ./bench-compare-vs-tanstack.sh
```

### Cross-router (real browser, all competitors)

`node cross-router/run.mjs <scenario> <engine> [framework=react] [runs=30]` — engine ∈ `real-router`|`tanstack`|`react-router` (react) · `real-router`|`vue-router`|`tanstack` (vue) · `real-router`|`solid-router`|`tanstack` (solid) · `real-router`|`sv-router`|`mateo-router` (svelte) · `real-router`|`angular-router` (angular); scenario ∈ `cold-start`|`nav-latency`|`param-nav`|`wide-config`|`deep-config`|`param-scaling`|`table-heap`|`link-build`|`nav-churn`|`active-links`|`nested-switch` (11). Big-table scenarios resolve to `apps/<fw>/<engine>/<variant>/` via the `VARIANT` map (`wide-config`→`wide`, `deep-config`→`deep`, `param-scaling`→`params`, `table-heap`→`tableheap`, `link-build`→`linkbuild`, `nested-switch`→`nested`, `active-links`→`links`); base scenarios use `apps/<fw>/<engine>/`. `_baseline` (bare React, no router) is a reference engine run for cold-start/nav-latency/link-build → REPORT.md "Router overhead over bare React".

```bash
pnpm bench:cross-router -- nav-latency real-router react 30   # one (scenario × engine)
node cross-router/run-all.mjs 15                              # FULL matrix — all cohorts (react+vue+solid, per-cohort engines) → results/
node cross-router/run-all.mjs 15 angular                      # one cohort (react|vue|solid|svelte|angular) with its own engine roster
node cross-router/harness/verify-features.mjs                 # functional capability demos → results/features.json
node cross-router/harness/report.mjs [react|vue|solid|svelte|angular] # results/<fw>/ → REPORT.md / REPORT-vue.md / REPORT-solid.md / REPORT-svelte.md / REPORT-angular.md — perf tables + capability matrix
node cross-router/harness/status-tables.mjs [react|vue|solid|svelte|angular] # committed REPORT*.md → flat status view: `сценарий | metric | engines | rr status` (🟡 parity <10%, else 🟢/🔴 delta from winner or, if rr first, nearest competitor). Reads the committed REPORTs (no results/ needed); `> view.md` to snapshot
node cross-router/harness/rme-gate.mjs [stable=15] [noisy=40] [cohort] # RME-gate: scans results/ and exits non-zero (1) if any metric's RME exceeds its family threshold — `stable` for reliable signals (total/script/heap/throughput), looser `noisy` for inherently-jittery blink/latency/fcp. Cross-router analogue of check-rme.sh; run AFTER run-all (exit 2 = no results). Env: RME_STABLE/RME_NOISY
```

Capability matrix (`✓ⁱ` = verified in-harness via a functional demo app under `apps/react/<engine>/{data,search,guard}/`) shows feature gaps a perf table can't — among the full routers, `react-router` lacks first-class validated search. `wouter` is excluded from the roster (minimalist location-matcher, different class + no cross-framework analog — see REPORT.md **Scope**). Per-cohort, never cross-framework.

**Per-cohort only — no cross-framework ranking** (a cross-framework number is mostly a framework comparison). CPU (`script`) + heap are the stable signals; latency is paint-noisy; `nav-churn.navsPerSec` is frame-capped (read CPU/nav + heap). Driven via the `playwright` package (programmatic Chromium + `CDPSession`), not `@playwright/test`. Results: `cross-router/REPORT.md`; design: [`.claude/cross-router-benchmarks-design.md`](../.claude/cross-router-benchmarks-design.md).

**Engines are measured as PRODUCTION `dist`, not `src` — fairness-critical, verified.** `run.mjs` does `vite build` + `preview` (a STATIC production bundle, **no on-the-fly compilation** — unlike dev-mode or the core `mitata` benches where `tsx` transpiles TS live and that cost pollutes results). vite resolves `@real-router/*` via the default `import` condition → `packages/*/dist/esm/index.mjs`; the `@real-router/internal-source`→`src/*.ts` condition is a *scoped* condition **invisible to vite** (only `tsc`/vitest activate it — **0** bench vite-configs add it). Competitors resolve to their published `node_modules` dist. Both real-router dist + competitor dist are esbuild-minified into the app bundle (`minify: esbuild`) → **fair dist-vs-dist, real shipped bytes**. **Empirically confirmed** (2026-07-02) via `vite pluginContainer.resolveId`: `core`/`react`/`browser-plugin` all → `packages/*/dist/esm/index.mjs`. Consequence: `cold-start`'s core-parse slice is real-router's *real* production-bundle load (a core-size / eager-init characteristic — a legit optimization axis, e.g. trim/lazy-init core), **NOT** a src-compilation artifact. **After any `packages/*/src` edit, re-`pnpm bundle`** or the bench measures the stale dist.

### Utilities

```bash
pnpm cpu                # Check CPU load before benchmarking
pnpm bench:type-check   # TypeScript validation
pnpm bench:lint         # ESLint
```

## Benchmark Sections (core)

| #   | Section            |
| --- | ------------------ |
| 1   | Navigation Basic   |
| 2   | Path Operations    |
| 3   | Current State      |
| 4   | Stress Testing     |

## JIT Warmup

**IMPORTANT:** mitata's default warmup (`warmup_samples=2`) is insufficient for V8 JIT optimization.

Without proper warmup (200+ iterations), GC pressure measurements are **unstable** and can vary 10x+.

`core/index.ts` implements custom JIT warmup: `JIT_WARMUP_ITERATIONS = 300` — exercises all major router code paths before the benchmark suite starts.

`core/isolated-anomalies.ts` uses `measure()` API with 500 warmup iterations per test for precise isolated measurements.

## Section 2 (Path Operations) — IC Megamorphism Artifact

**IMPORTANT:** Section 2 timing results from `bench-compare.sh` are unreliable for matchPath tests.

All bench tests in a single `.bench.ts` file share the same V8 inline caches (IC) on prototype
methods (`SegmentMatcher.prototype.match`, `makeState`, `freezeStateInPlace`). Each test creates
its own router, but the underlying class methods are shared functions in memory. When multiple tests
call the same method with different object shapes, ICs become megamorphic → slow path.

**Symptoms:**
- Bimodal distribution: tests are either ~30µs or ~230µs (for ×50 batch), nothing in between
- Adding warmup loops does NOT fix the issue — it MOVES it: previously fast tests become slow
- Same tests measured in isolation (`isolated-anomalies.ts`) show consistent ~25-50µs

**Reliable measurement:** Use `isolated-anomalies.ts` for Section 7 comparison.

**bench-compare.sh remains fair for router-to-router comparison** — both routers suffer equally
from IC pollution. But absolute numbers and intra-router test comparisons are unreliable.

## Benchmark Methodology

### Core (`bench-compare.sh`)

Per-section isolated runs to ensure fair comparisons:

1. For each section, run ALL routers (router5, router6, real-router)
2. Short cooldown (20s) between routers within the same section
3. Full thermal cooldown between sections

### vs-tanstack (`bench-compare-vs-tanstack.sh`)

Sequential comparison: TanStack Router first, then Real-Router, with cooldown between runs.
Both apps pre-built via Vite (production mode, no minification) before benchmarking.

## Benchmark Stability

For reliable results:

1. **Connect to power adapter** (CPU throttles on battery)
2. Close Chrome, Telegram, Slack, Discord, Spotify
3. Wait for thermal pressure = Nominal
4. Run with `sudo` for system optimizations

Both scripts automatically check power source and warn if running on battery.

## Apple Silicon Specifics

### Thermal Monitoring

```bash
sudo powermetrics --samplers thermal -i 1 -n 1
# Output: "Current pressure level: Nominal"
```

Levels: `Nominal` (OK) → `Moderate` → `Heavy` → `Critical` (throttling)

**NOT available:** `smc` sampler (Intel only)

## `core/.bench/` JSON Format

```json
{
  "name": "8.2.1 Batch comparing 1000 state pairs",
  "stats": {
    "avg": 28348.57,
    "p50": 27292,
    "p99": 62791,
    "max": 77292,
    "rme": 0.837,
    "heap": { "avg": 81419 }
  }
}
```

**RME interpretation** (values are in percent, e.g., `0.5` = 0.5%):

- `< 1%` — stable, reliable
- `1% - 5%` — moderate variance
- `> 5%` — unstable, investigate

```bash
# Check RME for specific test
jq '.[] | select(.name | contains("3.5.3")) | {name, rme: .stats.rme}' core/.bench/real-router/03-current-state.json

# Find high-RME tests
jq '.[] | select(.stats.rme > 0.5) | {name, rme: .stats.rme}' core/.bench/router6/*.json
```

## Environment Variables

| Variable            | Default       | Description                                                   |
| ------------------- | ------------- | ------------------------------------------------------------- |
| `BENCH_ROUTER`      | `real-router` | `real-router`, `router5`, or `router6`                        |
| `BENCH_SECTIONS`    | all           | Comma-separated section numbers (e.g., `1,2,3`)              |
| `SHORT_COOLDOWN`    | 20            | Cooldown between routers within a section (seconds)           |
| `COOLDOWN`          | 60            | Fallback cooldown when thermal pressure unavailable (seconds) |
| `MAX_COOLDOWN_WAIT` | 300           | Max thermal cooldown wait between sections (seconds)          |
