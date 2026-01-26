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

# Build @real-router/core and run benchmarks
pnpm bench:current

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
# Standard run
sudo ./bench-compare.sh

# With custom settings
sudo COOLDOWN=120 MAX_COOLDOWN_WAIT=600 ./bench-compare.sh
```

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `COOLDOWN` | 60 | Fallback cooldown in seconds (if thermal monitoring unavailable) |
| `MAX_COOLDOWN_WAIT` | 300 | Maximum wait time for thermal cooldown (5 min) |

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

Script for comparing benchmark results.

**Usage:**

```bash
# Automatically uses the latest pair of results
./compare.mjs

# Or with node
node compare.mjs

# Compare specific files
./compare.mjs 20260114_085727_router5.txt 20260114_085727_real-router.txt
```

**Output:**

1. **Performance Comparison** - execution time comparison
   - Benchmark name
   - router5 time
   - real-router time
   - Percentage difference (green = real-router faster, red = slower)

2. **Summary** - overall performance summary
   - Number of tests where real-router is faster/slower
   - Average performance difference

3. **Memory Allocation Comparison** - memory usage comparison
   - Memory allocations for each test
   - Percentage difference (green = real-router uses less, red = uses more)

4. **Memory Summary** - overall memory summary

**Example output:**

```
=== Benchmark Comparison ===

router5: 20260114_085727_router5.txt
real-router: 20260114_085727_real-router.txt

Performance Comparison
────────────────────────────────────────────────────────────────────────────
Benchmark                                                router5    real-router    Diff
────────────────────────────────────────────────────────────────────────────
1.1.1 Simple navigation between routes                  104.86 µs  104.61 µs      -0.24%
1.1.2 Navigation with route parameters                   17.29 µs   23.87 µs      +38.06%
...

Summary:
  Total benchmarks: 432
  real-router faster: 200 (46.3%)
  router5 faster: 232 (53.7%)
  Average difference: +5.2%
```

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

## Technical Details

- **Benchmarking library**: [mitata](https://github.com/evanwashere/mitata)
- **Runtime**: tsx (TypeScript execution)
- **Memory tracking**: Uses `--expose-gc` for heap measurements
- **Results format**: JSON files per category in `.bench/`
- **Thermal monitoring**: `powermetrics --samplers thermal` (Apple Silicon)
