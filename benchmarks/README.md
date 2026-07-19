# router-benchmarks

Competitive performance benchmarks for `@real-router/*`, plus the committed probe set for the `/deep-audit` skill.

## Layout

```
benchmarks/
├── cross-router/          # ⭐ the live suite — REAL Chromium (Playwright + CDP), all competitors, per-cohort
│   ├── apps/<fw>/<engine>/    # engine-agnostic cohort shells (only routing differs)
│   ├── scenarios/*.mjs        # engine-agnostic drivers (11 scenarios)
│   ├── harness/*.mjs          # cdp · measure · stats · rme-gate · sanity-remeasure
│   └── run.mjs · run-all.mjs  # one cell / full matrix → results/ (gitignored — source for the deck)
├── audit-probes/     # committed `/deep-audit` regression probes (NOT a benchmark suite)
├── react-router-bug/ # isolated repro for react-router#15249 (surfaced by cross-router deep-config)
└── bench-cross-router.sh  # sudo orchestrator: rebuild → readiness-gate → matrix → rme-gate → sanity
```

> **2026-07-05:** the old `core/` mitata suite (real-router vs router5 / router6) and the `vs-tanstack/` jsdom suite (speed / memory-churn / bundle-size) were **removed** — both superseded by `cross-router/` (real browser, all current competitors). Git-recoverable; the TanStack stack-overflow finding lives in git history at `vs-tanstack/TANSTACK_STACK_OVERFLOW.md`.

## Findings & isolated repros

- **react-router #15249 — deep-route match blowup.** The cross-router `deep-config` sweep surfaced a non-monotonic (parabolic) match-cost curve for react-router; [`react-router-bug/`](react-router-bug/) isolates it to a pure-Node `matchRoutes()` repro — the identical URL match is **~10× slower in a 210-deep route tree than a 90-deep one** (routes *below* the match are re-scanned). Live chart (browser-measured, match + render, swept to depth 210): <https://claude.ai/code/artifact/58736d29-e694-4c20-9f0c-3469bbcb6c44>. ⚠ The ms-scale absolutes and "~10×" time the *public per-call* `matchRoutes()` — 54–97% of those figures is its per-call flatten+rank, which a Data-mode router (`createBrowserRouter`) amortizes across navigations; amortized, the per-nav rescan alone still runs ~105× a µs-class matcher and the parabola survives (audit 2026-07-18).

## Cross-Router — real browser, all competitors

Real Chromium via Playwright + CDP, comparing **every competitor in a cohort** (not just one), metrics read straight from the DevTools Protocol (`Performance.getMetrics`, `HeapProfiler`). **Per-cohort only** — routers are compared within one framework; no cross-framework ranking (a cross-framework number is mostly a framework comparison). The same engine-agnostic drivers (interacting by `data-testid`) run against every engine — only the routing layer differs, which keeps it fair and the harness small (N drivers + M apps, not N×M scripts).

Cohorts (each 2–3 FULL routers): **react** (real-router · react-router@8 · @tanstack/react-router) · **vue** (· vue-router@4 · @tanstack/vue-router) · **solid** (· @solidjs/router · @tanstack/solid-router) · **svelte** (· sv-router · @mateothegreat/svelte5-router) · **angular** (· @angular/router). `_baseline` = bare framework floor.

11 scenarios: `cold-start` · `nav-latency` · `param-nav` · `wide-config` · `deep-config` · `search-param-scaling` · `table-heap` · `link-build` · `nav-churn` · `active-links` · `nested-switch`. Metrics: CPU (`script` + Blink → `total`), retained heap, and transient `allocKBPerNav` (GC pressure).

```bash
sudo ./bench-cross-router.sh                    # full unattended refresh (all cohorts, sudo orchestrator)
node cross-router/run-all.mjs 30 angular        # one cohort at n=30 → results/
```

**Results feed the interactive infographic deck** (rebuilt from `results/`); the committed text `REPORT-*.md` were **retired 2026-07-14** in favor of it. Design: [`.claude/cross-router-benchmarks-design.md`](.claude/cross-router-benchmarks-design.md). See [`cross-router/CLAUDE.md`](CLAUDE.md) for the harness internals, metric map, and gotchas.

## Machine & stability

Measured on **Apple M3 Pro** (Mac15,7), macOS. For reliable results: connect power (CPU throttles on battery), close Chrome / Telegram / Slack / Discord / Spotify, wait for thermal pressure = `Nominal`, run under `sudo`. The orchestrator handles system prep itself (`caffeinate` + `nice -20` + disables Spotlight / Time Machine + purges caches, all restored on exit).

```bash
sudo powermetrics --samplers thermal -i 1 -n 1   # "Current pressure level: Nominal"
pnpm cpu                                          # processes using >10% CPU
```

Levels: `Nominal` (OK) → `Moderate` → `Heavy` → `Critical` (throttling). `smc` sampler is Intel-only (N/A on Apple Silicon).

## audit-probes — /deep-audit probe home

**Not a benchmark suite.** `audit-probes/<slug>-YYYY-MM-DD/probe-*.ts` are the committed regression probes written by the `/deep-audit` skill — contract-behavior (direct `@real-router/core`) or micro-latency (mitata `measure()`). Run ad-hoc: `npx tsx <path>`. See [`.claude/commands/deep-audit.md`](../.claude/commands/deep-audit.md).
