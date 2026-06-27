# router-benchmarks

Tools for comparing performance between router5, router6, and @real-router/core.

## System Requirements

| Requirement      | Details                                                 |
| ---------------- | ------------------------------------------------------- |
| **OS**           | macOS (optimized for Apple Silicon)                     |
| **Node.js**      | 20+                                                     |
| **Privileges**   | `sudo` required for `bench-compare.sh`                  |
| **Power**        | Connect to power adapter for stable results             |
| **Applications** | Close Chrome, Telegram, Slack, Discord for best results |

### Apple Silicon Notes

The benchmark script uses `powermetrics --samplers thermal` to monitor thermal pressure levels:

- `Nominal` — optimal for benchmarking
- `Moderate`, `Heavy`, `Critical` — may affect results

## Quick Start

```bash
# Run benchmarks for @real-router/core
pnpm bench

# Run benchmarks for router5 (baseline)
pnpm bench:baseline

# Run benchmarks for router6
pnpm bench:router6

# Build @real-router/core and run benchmarks
pnpm bench:current

# Run specific sections only
BENCH_SECTIONS=1,2,3 pnpm bench

# Check processes using >10% CPU
pnpm cpu
```

## Scripts

### npm Scripts

| Script                | Description                          |
| --------------------- | ------------------------------------ |
| `pnpm bench`          | Run benchmarks for real-router       |
| `pnpm bench:baseline` | Run benchmarks for router5           |
| `pnpm bench:router6`  | Run benchmarks for router6           |
| `pnpm bench:current`  | Build real-router and run benchmarks |
| `pnpm cpu`            | Show processes using >10% CPU        |

### `bench-compare.sh` - Comparative Benchmarks

Automated script for running router5, router6, and real-router benchmarks under optimal conditions.

**Usage:**

```bash
# Run all sections
sudo ./bench-compare.sh

# Run specific sections only
sudo ./bench-compare.sh 1           # Navigation Basic only
sudo ./bench-compare.sh 1 2 3       # Multiple sections

# Show help with available sections
./bench-compare.sh --help

# With custom settings
sudo COOLDOWN=120 MAX_COOLDOWN_WAIT=600 ./bench-compare.sh
```

**Environment Variables:**

| Variable            | Default | Description                                                      |
| ------------------- | ------- | ---------------------------------------------------------------- |
| `COOLDOWN`          | 60      | Fallback cooldown in seconds (if thermal monitoring unavailable) |
| `MAX_COOLDOWN_WAIT` | 300     | Maximum wait time for thermal cooldown (5 min)                   |
| `BENCH_SECTIONS`    | all     | Comma-separated section numbers to run (e.g., `1,2,3`)           |

**What the script does:**

1. **Pre-flight checks:**
   - Checks power source (warns if running on battery)
   - Checks for distracting apps (Chrome, Telegram, WebStorm, Slack, Discord, Spotify)
   - Checks for processes with CPU > 10%
   - Checks for thermal throttling

2. **System optimization:**
   - Disables screensaver/display sleep (`caffeinate`)
   - Disables Spotlight indexing (`mdutil`)
   - Disables Time Machine backups (`tmutil`)
   - Purges file system caches (`sync && purge`)

3. **Benchmark execution:**
   - Runs benchmarks with high process priority (`nice -n -20`)
   - Smart cooldown between tests (waits for thermal pressure = Nominal)
   - Tests router5, router6, and real-router in sequence
   - Supports filtering by section numbers

4. **Cleanup (always runs, even on error/interrupt):**
   - Restores screensaver/sleep
   - Restores Spotlight indexing
   - Restores Time Machine

**Results:**

Saved to `.bench-results/`:

- `YYYYMMDD_HHMMSS_router5.txt`
- `YYYYMMDD_HHMMSS_router6.txt`
- `YYYYMMDD_HHMMSS_real-router.txt`

### `compare.mjs` - Results Analysis

Script for comparing benchmark results. Supports 2-way and 3-way comparisons.

**Usage:**

```bash
# Automatically uses the latest set of results (triplet or pair)
node compare.mjs

# Compare specific files (2 or 3 files)
node compare.mjs router5.txt real-router.txt
node compare.mjs router5.txt router6.txt real-router.txt
```

**Output (3-way comparison):**

```
=== Three-Way Benchmark Comparison ===

router5 (baseline): 20260130_124553_router5.txt
router6: 20260130_124553_router6.txt
real-router (current): 20260130_124553_real-router.txt

Performance Comparison
───────────────────────────────────────────────────────────────────────────────────────────
Benchmark                                │      router5      router6    real-router │   rr/r5   rr/r6
───────────────────────────────────────────────────────────────────────────────────────────
1.1.1 Simple navigation between routes   │    0.78 µs    2.23 µs    2.50 µs │   +220.5%     +12.1%
1.1.2 Navigation with route parameters   │    1.51 µs    2.30 µs    2.50 µs │    +65.6%      +8.7%
...

Performance Summary:
  Total benchmarks: 286
  rr faster than r5: 85 (29.7%)
  rr faster than r6: 120 (42.0%)
```

**Columns:**

- **router5, router6, real-router** — absolute execution times
- **rr/r5** — real-router vs router5 (green = faster, red = slower)
- **rr/r6** — real-router vs router6

## Benchmark Categories

| #   | Category         | Description                               |
| --- | ---------------- | ----------------------------------------- |
| 01  | Navigation Basic | Simple navigation, parameters, edge cases |
| 07  | Path Operations  | buildPath, matchPath, setRootPath         |
| 08  | Current State    | State creation, comparison, building      |
| 12  | Stress Testing   | High load, scaling                        |

## Performance — vs TanStack Router

Speed (navigation throughput) and memory (churn) for `@real-router/*` vs `@tanstack/*-router`, across React / Vue / Solid. Identical 10-step navigate workload (our port of TanStack `client-nav`), run locally in jsdom — `vitest bench` for speed, a self-made `forceGC` heap harness for memory (**not** CodSpeed).

```bash
pnpm bench:vs-tanstack -- client-nav real-router react speed          # throughput
pnpm bench:vs-tanstack -- navigation-churn real-router react memory   # memory churn
```

### Speed — navigation throughput (hz, higher = better)

| Framework | real-router | tanstack | real-router faster by |
| --------- | ----------- | -------- | --------------------- |
| react     | 925.8       | 65.7     | **14.1×**             |
| solid     | 978.8       | 84.4     | **11.6×**             |
| vue       | 167.9       | 74.3     | 2.3×                  |

Same workload, same framework render — the delta is router work. On React/Solid real-router is **over an order of magnitude** faster. Honest caveat: real-router's core does less per navigation (no built-in loader-lifecycle / structural-sharing that TanStack runs on every transition), so this is "faster because lighter by contract", measured fairly on the same bench. Vue's lower absolute hz is the real-router Vue adapter's reactivity overhead, not a TanStack win.

### Memory — churn (heap bytes per navigation, real-router / tanstack)

| Scenario                | react rr / ts | vue rr / ts | solid rr / ts |
| ----------------------- | ------------- | ----------- | ------------- |
| navigation-churn        | 33 / 3390     | 111 / 294   | 92 / 84       |
| unique-location-churn   | 43 / 5834     | 125 / 4444  | 143 / 2151    |
| mount-unmount           | 666 / 1284    | 414 / 866   | 451 / 29574   |
| interrupted-navigations | 296 / 10501   | 746 / 5968  | 705 / 3502    |
| loader-data-retention   | 336 / 5442    | 1069 / 1921 | 1147 / 1774   |

**real-router's heap floor is flat in all 15 runs** (round 1 ≈ round 5, ≤ 0.3 MB drift) — it does not accumulate matches/locations between navigations. TanStack's floor grows in several scenarios under this harness (e.g. unique-location-churn +7…+21 MB across frameworks).

> ⚠️ **Read the memory ratios carefully — they are harness-dependent, not a leak claim.** Per-navigation bytes are measured under our code-based `forceGC`; TanStack's own upstream bench (CodSpeed predictable-GC) is flat. The spread itself proves the dependence: solid `navigation-churn` is 0.9× (TanStack slightly *better*), solid `mount-unmount` 65× (a harness artifact). The defensible claim is **"real-router does not accumulate memory between navigations (flat floor everywhere)"**, _not_ a "×100 less memory" headline. Where both engines are flat (loader-data, vue/solid nav-churn) the honest ratio is 1.5–2.6×.

Measured 2026-06-27 (Apple M3 Pro, jsdom). Speed: `vitest bench` (warmup 100, 10 s). Memory: 5 rounds × N navigations with double `forceGC`.

## Bundle Size — vs TanStack Router

Competitive client-JS size: `@real-router/*` vs `@tanstack/*-router`, across React / Vue / Solid in `minimal` and `full` app fixtures (built as full client apps via Vite — production, esbuild-minified, es2022).

```bash
pnpm bench:bundle-size   # builds every fixture, prints the table below
```

**Two metrics.** The raw total client JS is framework-dominated — react-dom alone is ~59 KB gzip — so the absolute number is mostly the framework, not the router. The primary signal is **router-attributable = total − framework baseline** (`_baseline/<fw>`: same framework, "hello world", no router) — the real weight of `core + ui-adapter`.

**Framework runtime baseline** (gzip, no router): React 59.2 · Vue 23.4 · Solid 2.7 KB.

**Router-attributable** — the size of the router itself (KB):

| Fixture       | real-router gzip | tanstack gzip | Δ gzip   | real-router brotli | tanstack brotli |
| ------------- | ---------------- | ------------- | -------- | ------------------ | --------------- |
| react minimal | **26.4**         | 27.3          | **−0.9** | 23.1               | 24.1            |
| react full    | 28.2             | 27.5          | +0.7     | 24.7               | 24.3            |
| vue minimal   | 29.4             | 29.3          | +0.1     | 25.7               | 25.9            |
| vue full      | 31.2             | 29.5          | +1.7     | 27.3               | 26.1            |
| solid minimal | **27.9**         | 32.0          | **−4.1** | 24.7               | 28.9            |
| solid full    | 32.8             | 32.2          | +0.6     | 29.1               | 29.1            |

`minimal` = router + 1 route; `full` = broad adapter surface (Link / RouteView / route hooks), no plugins — a 1:1 surface comparison vs TanStack's built-in surface.

**Reading:** real-router's router weight (core + ui-adapter, no env/browser-plugin) is ~26–29 KB gzip — **at parity with TanStack on React/Vue (within ±1.7 KB), ~4 KB lighter on Solid**. real-router is modular: plugins (browser / memory / lifecycle / preload / …) are opt-in and add only what you use, whereas TanStack's loader / history / preload sit in the baseline always. Adding `environment-plugin` puts the minimal real-router stack near ~35 KB gzip.

Total client JS (framework + router — TanStack's own methodology) is printed alongside in the `measure.mjs` output. Measured 2026-06-27.

## Directory Structure

```
benchmarks/
├── core/                        # Benchmark source files (Mitata-based)
│   ├── index.ts                 # Entry point, runs all benchmarks
│   ├── helpers/                 # Shared utilities
│   │   ├── router-adapter.ts    # Adapter for router5/router6/real-router
│   │   ├── create-router.ts     # Router factory
│   │   └── suppress-console.ts  # Console suppression
│   ├── 01-navigation-basic/     # Category benchmarks
│   ├── 07-path-operations/
│   ├── 08-current-state/
│   └── 12-stress-testing/
├── .bench/                      # JSON results per router
│   ├── real-router/             # real-router results by category
│   ├── router5/                 # router5 results by category
│   └── router6/                 # router6 results by category
├── .bench-results/              # Text results from bench-compare.sh
├── bench-compare.sh             # Comparative benchmark runner
├── compare.mjs                  # Results analysis script
├── package.json
├── tsconfig.json
└── README.md
```

## Recommendations

1. **Run benchmarks under identical conditions:**
   - Close unnecessary applications (especially Chrome)
   - Use `sudo` for bench-compare.sh
   - Connect MacBook to power adapter
   - Let thermal pressure return to Nominal between runs

2. **Interpreting results:**
   - Small differences (<5%) may be statistical noise
   - Pay attention to patterns (which operation types are slower/faster)
   - Compare results from multiple runs

3. **Troubleshooting:**
   - If results vary significantly between runs — check `pnpm cpu` for heavy processes
   - If thermal throttling detected — wait for system to cool down
   - Increase `MAX_COOLDOWN_WAIT` for more stable results

## Technical Details

- **Benchmarking library**: [mitata](https://github.com/evanwashere/mitata)
- **Runtime**: tsx (TypeScript execution)
- **Memory tracking**: Uses `--expose-gc` for heap measurements
- **Results format**: JSON files per category in `.bench/`
- **Thermal monitoring**: `powermetrics --samplers thermal` (Apple Silicon)
- **Section filtering**: `BENCH_SECTIONS` env var or CLI arguments
