# router-benchmarks

Tools for comparing performance between router5, router6, and @real-router/core.

## System Requirements

| Requirement | Details |
|-------------|---------|
| **OS** | macOS (optimized for Apple Silicon) |
| **Node.js** | 20+ |
| **Privileges** | `sudo` required for `bench-compare.sh` |
| **Power** | Connect to power adapter for stable results |
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

# Run benchmarks with noValidate option (real-router only)
pnpm bench:novalidate

# Build @real-router/core and run benchmarks
pnpm bench:current

# Run specific sections only
BENCH_SECTIONS=1,2,3 pnpm bench

# Check processes using >10% CPU
pnpm cpu
```

## Scripts

### npm Scripts

| Script                  | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `pnpm bench`            | Run benchmarks for real-router                     |
| `pnpm bench:baseline`   | Run benchmarks for router5                         |
| `pnpm bench:router6`    | Run benchmarks for router6                         |
| `pnpm bench:novalidate` | Run benchmarks with noValidate option (real-router)|
| `pnpm bench:current`    | Build real-router and run benchmarks               |
| `pnpm cpu`              | Show processes using >10% CPU                      |

### `bench-compare.sh` - Comparative Benchmarks

Automated script for running router5, router6, real-router, and real-router with noValidate benchmarks under optimal conditions.

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

| Variable | Default | Description |
|----------|---------|-------------|
| `COOLDOWN` | 60 | Fallback cooldown in seconds (if thermal monitoring unavailable) |
| `MAX_COOLDOWN_WAIT` | 300 | Maximum wait time for thermal cooldown (5 min) |
| `BENCH_SECTIONS` | all | Comma-separated section numbers to run (e.g., `1,2,3`) |

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
   - Tests router5, router6, real-router, and real-router with noValidate in sequence
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
- `YYYYMMDD_HHMMSS_real-router-novalidate.txt`

### `compare.mjs` - Results Analysis

Script for comparing benchmark results. Supports 2-way, 3-way, and 4-way comparisons.

**Usage:**

```bash
# Automatically uses the latest set of results (quartet, triplet, or pair)
node compare.mjs

# Compare specific files (2, 3, or 4 files)
node compare.mjs router5.txt real-router.txt
node compare.mjs router5.txt router6.txt real-router.txt
node compare.mjs router5.txt router6.txt real-router.txt real-router-novalidate.txt
```

**Output (4-way comparison):**

```
=== Four-Way Benchmark Comparison ===

r5     = router5 (baseline): 20260130_124553_router5.txt
r6     = router6: 20260130_124553_router6.txt
rr     = real-router: 20260130_124553_real-router.txt
rr(nv) = real-router (noValidate: true): 20260130_124553_real-router-novalidate.txt

Performance Comparison
───────────────────────────────────────────────────────────────────────────────────────────
Benchmark                                │         r5         r6         rr     rr(nv) │      rr/r5      rr/r6      nv/rr
───────────────────────────────────────────────────────────────────────────────────────────
1.1.1 Simple navigation between routes   │    0.78 µs    2.23 µs    2.70 µs    2.50 µs │   +246.4%     +21.1%      -7.4%
1.1.2 Navigation with route parameters   │    1.51 µs    2.30 µs    2.70 µs    2.50 µs │    +78.8%     +17.4%      -7.4%
...

Performance Summary:
  Total benchmarks: 286
  rr faster than r5: 85 (29.7%)
  rr faster than r6: 120 (42.0%)
  rr(nv) faster than rr: 280 (97.9%)
```

**Columns:**
- **r5, r6, rr, rr(nv)** — absolute execution times
- **rr/r5** — real-router vs router5 (green = faster, red = slower)
- **rr/r6** — real-router vs router6
- **nv/rr** — noValidate vs regular real-router

## Benchmark Categories

| #   | Category           | Description                                 |
| --- | ------------------ | ------------------------------------------- |
| 01  | Navigation Basic   | Simple navigation, parameters, edge cases   |
| 02  | Navigation Plugins | Sync/async middleware and guards            |
| 03  | Dependencies       | Dependency injection operations             |
| 04  | Plugins Management | Plugin registration and lifecycle           |
| 05  | Router Options     | Options initialization and modification     |
| 07  | Path Operations    | buildPath, matchPath, setRootPath           |
| 08  | Current State      | State creation, comparison, building        |
| 09  | Redirects          | Middleware redirects, guards, forwardTo     |
| 10  | Start/Stop         | Router lifecycle operations                 |
| 11  | Events             | addEventListener, subscribe, event dispatch |
| 12  | Stress Testing     | High load, scaling, auto-cleanup            |
| 13  | Cloning            | SSR scenarios, testing, isolation           |

## Directory Structure

```
packages/router-benchmarks/
├── src/                         # Benchmark source files
│   ├── index.ts                 # Entry point, runs all benchmarks
│   ├── helpers/                 # Shared utilities
│   │   ├── router-adapter.ts    # Adapter for router5/router6/real-router
│   │   ├── create-router.ts     # Router factory
│   │   └── suppress-console.ts  # Console suppression
│   ├── 01-navigation-basic/     # Category benchmarks
│   ├── 02-navigation-plugins/
│   ├── 03-dependencies/
│   ├── 04-plugins-management/
│   ├── 05-router-options/
│   ├── 07-path-operations/
│   ├── 08-current-state/
│   ├── 09-redirects/
│   ├── 10-start-stop/
│   ├── 11-events/
│   ├── 12-stress-testing/
│   └── 13-cloning/
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

## noValidate Option

The `noValidate` option is available **only in @real-router/core**. When enabled, it skips runtime validation checks for improved performance in production environments.

```bash
# Run benchmarks with noValidate
pnpm bench:novalidate

# Or via environment variable
BENCH_NO_VALIDATE=true pnpm bench
```

Typical performance improvement with `noValidate: true`: **5-10%** faster execution.

## Technical Details

- **Benchmarking library**: [mitata](https://github.com/evanwashere/mitata)
- **Runtime**: tsx (TypeScript execution)
- **Memory tracking**: Uses `--expose-gc` for heap measurements
- **Results format**: JSON files per category in `.bench/`
- **Thermal monitoring**: `powermetrics --samplers thermal` (Apple Silicon)
- **Section filtering**: `BENCH_SECTIONS` env var or CLI arguments
