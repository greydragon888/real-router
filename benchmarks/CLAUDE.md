# router-benchmarks

> Cross-router performance benchmarks (real browser, Playwright + CDP): `@real-router/*` vs per-framework competitors. Also hosts `audit-probes/` — the committed probe set for the `/deep-audit` skill.

## Structure

```
benchmarks/
├── core/                          # /deep-audit probe home (NOT a benchmark suite; mitata-only dep)
│   └── audit-probes/              # committed regression probes from `/deep-audit` runs
│       #  <slug>-YYYY-MM-DD/probe-*.ts — direct @real-router/core (contract-behavior) OR mitata measure() (micro-latency)
│   #  ⚠ 2026-07-05: the router5/6 mitata comparison suite (01-04, index.ts, isolated-*.ts, helpers/) AND the
│   #  vs-tanstack jsdom suite were REMOVED — superseded by cross-router (real browser). Both git-recoverable;
│   #  the TanStack stack-overflow finding lives in git history at vs-tanstack/TANSTACK_STACK_OVERFLOW.md.
├── cross-router/                  # REAL browser (Playwright + CDP): ALL competitors, per-cohort (no cross-framework rank)
│   ├── apps/<framework>/<engine>/ # per-cohort shells (engine-agnostic, only routing differs): base + {wide,deep,nested,links,params,tableheap,linkbuild} variants + feature demos {data,search,guard}
│   │   #  react cohort: real-router · react-router (v8 Data mode) · tanstack — wouter EXCLUDED (minimalist, different class) · _baseline = bare React floor · real-router-full = REFERENCE variant (base app + production plugin stack: browser+persistent-params+search-schema+ssr-data): SELF-calibration only, BY DESIGN — Δ(full−bare) = per-nav cost of enabled capabilities, the coefficient for translating bare-matrix numbers into production expectations. Compares only vs rr itself because a fair full-vs-full is semantically impossible (react-router has no detachable persistent-params/validated-search analog; TanStack search validation is baked-in/non-removable — its bare cell already pays it), so the matrix stays bare-vs-bare. Also the FIRST perf cell where persistent-params/search-schema/ssr-data per-nav code executes at all (regression cell after plugin edits). react-only (stack is core-level, framework-agnostic). NOT in run-all rosters; run manually: run.mjs {nav-latency,param-nav} real-router-full react 50. See IMPLEMENTATION_NOTES «real-router-full reference bench variant»
│   │   #  preact cohort REMOVED (2026-06-29) — no full-router competitor (preact-iso = minimalist/recommended, preact-router = deprecated); no honest competitive perf comparison. apps/preact/ deleted (git-recoverable); @real-router/preact adapter still ships + is tested
│   │   #  vue cohort: real-router · vue-router@4 (Vue 3 official; v5 pulls pinia — excluded) · @tanstack/vue-router — three FULL routers, like-for-like; Vue JSX apps (@vitejs/plugin-vue-jsx, all dedupe ['vue']) · _baseline = bare Vue floor
│   │   #  solid cohort: real-router · @solidjs/router (official) · @tanstack/solid-router — three FULL routers, like-for-like; Solid JSX apps (vite-plugin-solid, dedupe ['solid-js']) · _baseline = bare Solid floor. Findings: @solidjs/router lean (leads most raw metrics); rr wins nav-latency/link-build/active-links; rr deep-nesting O(depth) → #1094; @tanstack/solid-router deep N/A (errors on 60+ nesting)
│   │   #  svelte cohort: real-router · sv-router (community Svelte-5 full router) · @mateothegreat/svelte5-router (engine dir `mateo-router`) — three FULL routers (NO @tanstack/svelte-router — npm 404; svelte-spa-router/svelte-routing minimalist-excluded like wouter; SvelteKit framework-bundled); Svelte 5 SFC apps (@sveltejs/vite-plugin-svelte 6.2.4 [7.x needs vite 8], dedupe ['svelte']) · _baseline = bare Svelte. Findings: rr WINS wide@1000 (trie flat 0.44 vs sv-router O(N) 0.80) + active-links + ONLY full-capability (guard/search/data/scroll); sv-router lean (memory 2.26@10k, link-build, most per-nav); rr deep #1094 (directional — #1094 research: 60% Solid-bench-artifact) + heavy <Link> (link-build 14.6 vs baseline 3.0)
│   │   #  angular cohort: real-router · @angular/router (Angular's OFFICIAL router — standalone lib configured via provideRouter like vue-router, NOT framework-bundled; ONLY serious Angular router, no 3rd-party → 2-engine cohort by ecosystem reality); Angular 22 ZONELESS standalone-component apps (@analogjs/vite-plugin-angular AOT + @angular/build peer) · _baseline = bare Angular. Findings: @angular/router WINS most (boot ~3× lighter, nav/param, wide FLAT+lean 0.33, memory 3.67@10k, churn-CPU, nested); rr WINS only active-links (cached active-source) + link-build (14.3<18.05); deep ~wash (both O(depth)); capability rr 4/4 vs angular-router 3/4 (only validated-search edge). TOUGHEST cohort for rr — @angular/router objectively excellent
│   ├── scenarios/*.mjs            # 12 engine-agnostic drivers: cold-start · nav-latency · param-nav · wide-config ·
│   │   #  deep-config · search-param-scaling · table-heap · nav-churn · active-links · back-forward · link-build · nested-switch  (sweeps emit per-size @N/@D keys)
│   ├── harness/                   # cdp.mjs (CDPSession: Performance.getMetrics + HeapProfiler) · stats.mjs (median/p95/RME) · measure.mjs · rme-gate.mjs · sanity-remeasure.mjs (#1261 mid-run load guard) · verify-features.mjs
│   ├── run.mjs · run-all.mjs      # one run / full matrix → results/<fw>/<scenario>/<engine>.json; VARIANT map routes big-table scenarios to <engine>/<variant>/
│   ├── results/ (gitignored)      # source the infographic deck is rebuilt from (text REPORT-*.md retired 2026-07-14)
│   ├── SCENARIO-LAG-ANALYSIS.md   # cross-cohort ROOT-CAUSE ledger: WHY rr lags per scenario (A/B-proven / code-traced / inferred), cause-class + verdict (STRUCTURAL / FEATURE-COST / WINNABLE / FIXED). Record every new perf investigation here, not only in memory
│   └── tsconfig.json (react-jsx; excludes apps/vue + apps/solid) · apps/vue/tsconfig.json (jsxImportSource vue) · apps/solid/tsconfig.json (jsxImportSource solid-js) · apps/svelte: NO tsconfig (SFC) · apps/angular/<engine>/{tsconfig,tsconfig.app}.json (per-app; Angular AOT via analog, strictTemplates type-checks at build) · .gitignore
│      #  type-check (ungated, manual/IDE): tsc -p cross-router/tsconfig.json (react) · -p cross-router/apps/vue/tsconfig.json (vue) · -p cross-router/apps/solid/tsconfig.json (solid). NB: IDE tsserver mis-applies react-jsx to solid files (flood of false "React.JSX / --jsx" errors) — the `tsc -p apps/solid` run is AUTHORITATIVE (0 errors); ignore the IDE noise for solid apps. Svelte apps have NO tsc step — `vite build` (svelte plugin) is the check; verify via `run.mjs <scenario> <engine> svelte`. Angular apps: NO separate tsc — the AOT build (@analogjs/vite-plugin-angular, strictTemplates) type-checks; IDE shows FALSE "tslib / Cannot find ./pages" noise (stale tsserver, not the AOT resolver) — authoritative is `run.mjs <scenario> <engine> angular`
└── bench-cross-router.sh          # Cross-router unattended full-run orchestrator (sudo): rebuild dist → machine-readiness → per-cohort matrix → rme-gate → sub-ms sanity re-measure (#1261) + REPORT regen, load recheck between cohorts. Workload runs as $SUDO_USER (Playwright/Chromium can't run as root)
```

## Machine

- **Model:** Mac15,7 (MacBook Pro)
- **Chip:** Apple M3 Pro
- **OS:** macOS 25B78

## Key Commands

### Cross-router (real browser, all competitors)

`node cross-router/run.mjs <scenario> <engine> [framework=react] [runs=30]` — engine ∈ `real-router`|`tanstack`|`react-router` (react) · `real-router`|`vue-router`|`tanstack` (vue) · `real-router`|`solid-router`|`tanstack` (solid) · `real-router`|`sv-router`|`mateo-router` (svelte) · `real-router`|`angular-router` (angular); scenario ∈ `cold-start`|`nav-latency`|`param-nav`|`wide-config`|`deep-config`|`search-param-scaling`|`table-heap`|`link-build`|`nav-churn`|`active-links`|`back-forward`|`nested-switch` (12). Big-table scenarios resolve to `apps/<fw>/<engine>/<variant>/` via the `VARIANT` map (`wide-config`→`wide`, `deep-config`→`deep`, `search-param-scaling`→`searchparams`, `table-heap`→`tableheap`, `link-build`→`linkbuild`, `nested-switch`→`nested`, `active-links`→`links`); base scenarios use `apps/<fw>/<engine>/`. **`search-param-scaling`** = the realistic high-count param vector (query params `/sN?k1..kN`, sweep 1/10/50) with the leaf reading EVERY value (`readSearch` checksum → forces lazy routers to materialize). **It REPLACED the old path-`param-scaling`** (removed 2026-07-04): 100 path segments is synthetic (real routes ≤4 path params), and its keys-only read let lazy routers skip materialization; query params (marketplace filters/analytics/tracking) genuinely go 20-50+ and are the honest high-count vector. `_baseline` (bare React, no router) is a reference engine run for cold-start/nav-latency/link-build — the router's overhead over bare React. **Memory axis — `allocKBPerNav` (added 2026-07-05):** the per-nav scenarios (`nav-latency`, `param-nav`, `search-param-scaling`, `back-forward`) each run an extra allocation-sampling pass (`sampleAllocationBytes` in `harness/cdp.mjs` → CDP `HeapProfiler.startSampling`/`stopSampling` **with `includeObjectsCollectedBy{Major,Minor}GC`** so GC-reclaimed transients are counted, ~256 B interval, sum of profile self-sizes ÷ navs) reporting **gross transient bytes allocated per nav = GC pressure** (garbage included, NOT live-at-stop — the include-flags are what make it gross; without them the profiler drops collected samples and the sum degrades to ≈ retained growth, silently floor-violating, see #1417) — the memory *counterpart* to the `script`/`Blink` CPU rows, and DISTINCT from `table-heap`/`nav-churn`/`cold-start` (which force GC and measure *retained* footprint, not churn). `search-param-scaling`'s pass toggles @50↔@1 (both leaves read all values) — the eager-vs-lazy allocation contrast: eager immutable params reference URL-parsed strings (flat with count) while parse/validate/structural-share pipelines allocate O(count) garbage. ⚠️ The 2026-07-05 probe figures (react real-router ~0.13 KB/nav *flat* vs @tanstack ~1.4, ~11×, "leanest allocator") were measured under the **pre-#1417 retained proxy** — a gross pass runs ~100× higher (e.g. solid param-nav real-router 0.059→6.4 KB/nav) and can re-rank engines (low-retained ≠ low-churn), so those numbers AND the ranking are stale until a gross re-population lands. It's a new metric → existing results lack it until the next full run repopulates. ~60 navs/pass → ~28-1000 samples depending on engine; the warmup+K median stabilizes it (RME < 15%).

```bash
# Full unattended refresh (RECOMMENDED for the n=15 big-refresh) — sudo orchestrator:
#   rebuild all dist → machine-readiness gate (power/thermal/apps) → per-cohort matrix
#   → rme-gate → sub-ms sanity re-measure (#1261) + REPORT regen, with thermal cooldown
#   + heavy-process recheck between cohorts. Chromium runs as you, not root.
sudo ./bench-cross-router.sh                                  # all 5 cohorts, n=15, rebuild first
sudo ./bench-cross-router.sh --smoke                          # n=1 dry matrix first (fail-fast), then the full run
sudo ./bench-cross-router.sh --runs 30 solid                  # one cohort at n=30
sudo ./bench-cross-router.sh --no-build angular               # skip rebuild (dist already fresh)

pnpm bench:cross-router -- nav-latency real-router react 30   # one (scenario × engine)
node cross-router/run-all.mjs 15                              # FULL matrix — all cohorts (react+vue+solid, per-cohort engines) → results/
node cross-router/run-all.mjs 15 angular                      # one cohort (react|vue|solid|svelte|angular) with its own engine roster
node cross-router/harness/verify-features.mjs                 # functional capability demos → results/features.json
node cross-router/harness/rme-gate.mjs [stable=15] [noisy=40] [cohort] # RME-gate: scans results/ and exits non-zero (1) if any metric's RME exceeds its family threshold — `stable` for reliable signals (total/script/heap/throughput), looser `noisy` for inherently-jittery blink/latency/fcp. Cross-router analogue of check-rme.sh; run AFTER run-all (exit 2 = no results). Env: RME_STABLE/RME_NOISY
node cross-router/harness/sanity-remeasure.mjs <fw> [runs=12] [shift%=20] # Sub-ms sanity (#1261): re-measures nav-latency × real-router at small n WITHOUT writing results/, compares medians vs the recorded cell — catches MID-RUN load inflation neither the readiness gate (pre-run only) nor the RME gate (a uniformly-inflated cell is internally consistent — 07-05: +47% with RME green) can see. Exit 1 = |shift| > threshold, either direction (fresh ≪ recorded = matrix was loaded; fresh ≫ recorded = load NOW): sub-ms per-nav class suspect, stable classes unaffected · 2 = no recorded cell/app ("cannot judge"). Run per cohort by bench-cross-router.sh (env SANITY_RUNS=12 / SANITY_SHIFT=20; SANITY_RUNS=0 skips); alloc row printed as control (bytes ≠ duration — alloc flat + totalMs shifted = load, not code)
```

Capability matrix (`✓ⁱ` = verified in-harness via a functional demo app under `apps/react/<engine>/{data,search,guard}/`) shows feature gaps a perf table can't — among the full routers, `react-router` lacks first-class validated search. `wouter` is excluded from the roster (minimalist location-matcher, different class + no cross-framework analog). Per-cohort, never cross-framework.

**Per-cohort only — no cross-framework ranking** (a cross-framework number is mostly a framework comparison). CPU (`script`) + heap are the stable signals; latency is paint-noisy; `nav-churn.navsPerSec` is frame-capped (read CPU/nav + heap). Driven via the `playwright` package (programmatic Chromium + `CDPSession`), not `@playwright/test`. Results: `cross-router/results/` (feeds the infographic deck); design: [`.claude/cross-router-benchmarks-design.md`](../.claude/cross-router-benchmarks-design.md).

**Sweeps measure WARM steady state, not the cold first nav (#1453).** `measure.mjs` runs each sample in a fresh context, and every sweep `land()` is a full `page.goto` reload that resets V8 to interpreted code — so a single post-reload nav timed the *interpreter*, and the per-engine cold penalty (larger for heavier bundles) poisoned cross-engine `@N` absolutes (measured: solid real-router carried ~0.3 ms of extra interpreter cost over @solidjs/router that vanished when warmed). `wide-config`/`deep-config`/`search-param-scaling` now warm the realm with `WARM_NAVS=12` in-document navs before the ONE measured nav — wide/search toggle `target↔pivot` via the persistent nav; deep round-trips `home↔D`, detecting the return home by the target *vanishing* (`__navMetric.settleGone`, the mirror of `settle`, since deep's home has no positive universal marker). The matcher/parse/composition **curve** is source-independent and unchanged; only the cold-JIT floor is removed, so `@N` absolutes dropped (floor-dominated sizes ~85%: wide@1000 rr 0.66→0.10 ms script; composition-dominated deep@90 only ~11% — its cost is real render work). Validate with `harness/f3-warm-validate.mjs <engine> [fw] [variant] [target]` (same-session cold-vs-warm, no results/ write).

**Sweep HEADLINE is `navMsTask@N` + `navMsWall@N`, not `scriptMs@N` (#1451, closing F2 in the sweeps too).** `ScriptDuration` is V8-only and blind to async engines' microtask composition, so the old `scriptMs@N` / `totalMs@N = script+blink` printed a FALSE flat curve for @solidjs/router / vue-router / @tanstack (measured: solid-router deep@90 `scriptMs` **0.035** — near-flat artifact — vs `navMsTask` **0.838**, a **24× undercount**; on the honest task metric solid-router is even *heavier* than rr at depth 90, the opposite of the scriptMs story the audit flagged as instrumental). The measured nav is now timed click→settle (`perf.now` = `navMsWall`, `ΔTaskDuration` = `navMsTask`, both microtask-inclusive); `scriptMs@N` stays a ⚠ diagnostic, `totalMs@N` is retired. `navMsTask@N` **leads** over `navMsWall@N` because the single-nav `perf.now` is ~100 µs clamp-quantized (the per-nav scenarios sum N navs so their wall is clean; sweeps measure one nav per size). So `navMsWall@N` is emitted at the **endpoint only** (matching the report row) and `rme-gate` classes `navMsWall@N` **noisy** — a lean engine at the endpoint (rr wide@1000 ≈ 0.1 ms = 1 clamp step) has a high RME by *quantization*, not instability, and must not fail a healthy 4-h matrix; `navMsTask@N` (unclamped) stays stable-gated as the headline. **Consequence: the sweep metric KEYS changed → REPORT sweep tables render `—` and the blurbs' absolutes are stale until the next re-baseline** (unlike the F3-only change, which kept keys).

**Smoke-grade cells never reach `results/` (#1455).** `run.mjs` refuses to write a cell when `runs < N_MIN` (=10) — it still builds/measures/prints (so `--smoke` fail-fast AND same-session A/B at n≥12 both work), but a low-n cell's reported RME (`stats.mjs` z=1.96) badly understates its true small-sample CI, and cross-session sub-ms drift can *invert* a Δ — so it must not sit in `results/` indistinguishable from a real cell. `rme-gate` also FAILS on any pre-existing `n < N_MIN` cell (defense-in-depth; env `RME_MIN_N`). **Corollary — `Δ(full−bare)` is same-session only:** the `real-router-full` variant prices the production plugin stack (persistent-params + search-schema + ssr-data over the base app); measure its bare/full pair **back-to-back in one session** (`run.mjs nav-latency real-router react 50 && run.mjs nav-latency real-router-full react 50`) — a cross-session pair produced a physically-impossible **−51%** Δ (full cheaper than a strict superset) purely from ~2× sub-ms drift — the "same-session A/B only for sub-ms" rule, caught live (#1455).

**The matrix INTERLEAVES engines and refuses a stale dist (#1459 / #1460).** `run-all.mjs` no longer measures one engine's cell then the next — for each scenario it builds + serves ALL of a cohort's engines and measures them ROUND-ROBIN in one browser session (`measureInterleaved`, rotating the order each round), so mid-run machine drift hits every engine equally (no engine is systematically first — the S4 position-bias class a fixed roster left open). Before any build both runners call a shared dist-freshness gate (`harness/provenance.mjs`): if `max(mtime packages/*/src) > max(mtime packages/*/dist)` it **REFUSES** (`exit 3`, override `BENCH_ALLOW_STALE_DIST=1`) — engines resolve to `dist/`, and the 07-11 vue matrix silently measured a pre-#1424 dist. Every cell's `env` now carries `{commit, dirty, distNewestMtime}`. `run.mjs` (one cell) + `run-all.mjs` (interleaved matrix) share the gate, the provenance stamp, the smoke-grade write guard, and the scenario/variant registry (`harness/{provenance,write-cell,scenarios-registry}.mjs`) so the two can't drift.

**Engines are measured as PRODUCTION `dist`, not `src` — fairness-critical, verified.** `run.mjs` does `vite build` + `preview` (a STATIC production bundle, **no on-the-fly compilation** — unlike dev-mode or the core `mitata` benches where `tsx` transpiles TS live and that cost pollutes results). vite resolves `@real-router/*` via the default `import` condition → `packages/*/dist/esm/index.mjs`; the `@real-router/internal-source`→`src/*.ts` condition is a *scoped* condition **invisible to vite** (only `tsc`/vitest activate it — **0** bench vite-configs add it). Competitors resolve to their published `node_modules` dist. Both real-router dist + competitor dist are esbuild-minified into the app bundle (`minify: esbuild`) → **fair dist-vs-dist, real shipped bytes**. **Empirically confirmed** (2026-07-02) via `vite pluginContainer.resolveId`: `core`/`react`/`browser-plugin` all → `packages/*/dist/esm/index.mjs`. Consequence: `cold-start`'s core-parse slice is real-router's *real* production-bundle load (a core-size / eager-init characteristic — a legit optimization axis, e.g. trim/lazy-init core), **NOT** a src-compilation artifact. **After any `packages/*/src` edit, re-`pnpm bundle`** or the bench measures the stale dist.

### Utilities

```bash
pnpm cpu                # Check CPU load before benchmarking
pnpm bench:type-check   # TypeScript validation
pnpm bench:lint         # ESLint
```

## Benchmark Stability

For reliable results:

1. **Connect to power adapter** (CPU throttles on battery)
2. Close Chrome, Telegram, Slack, Discord, Spotify
3. Wait for thermal pressure = Nominal
4. Run with `sudo` for system optimizations

`bench-cross-router.sh`'s readiness gate checks power source and warns if running on battery.

## Apple Silicon Specifics

### Thermal Monitoring

```bash
sudo powermetrics --samplers thermal -i 1 -n 1
# Output: "Current pressure level: Nominal"
```

Levels: `Nominal` (OK) → `Moderate` → `Heavy` → `Critical` (throttling)

**NOT available:** `smc` sampler (Intel only)
