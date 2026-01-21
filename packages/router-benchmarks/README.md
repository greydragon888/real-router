# router-benchmarks

Tools for comparing performance between router5 and @real-router/core.

## Quick Start

```bash
# Run benchmarks for @real-router/core
pnpm bench

# Run benchmarks for router5 (baseline)
pnpm bench:baseline

# Build @real-router/core and run benchmarks
pnpm bench:current
```

## Scripts

### npm Scripts

| Script                | Description                          |
| --------------------- | ------------------------------------ |
| `pnpm bench`          | Run benchmarks for real-router       |
| `pnpm bench:baseline` | Run benchmarks for router5           |
| `pnpm bench:current`  | Build real-router and run benchmarks |

### `bench-compare.sh` - Running Comparative Benchmarks

Automated script for running router5 and real-router benchmarks under optimal conditions.

**Requirements:**

- Run with `sudo` (to disable Spotlight indexing)
- Automatic CPU load check (10% threshold)
- Cooldown period between tests (default 60 seconds)

**Usage:**

```bash
# With sudo privileges
sudo ./bench-compare.sh

# With custom cooldown period
sudo COOLDOWN=120 ./bench-compare.sh
```

**What the script does:**

1. Checks for processes with CPU > 10%
2. Disables Spotlight indexing and screensaver
3. Runs benchmarks for router5
4. Waits for cooldown period
5. Runs benchmarks for real-router
6. Restores system settings
7. Saves results to `.bench-results/`

**Results:**

- `YYYYMMDD_HHMMSS_router5.txt` - router5 results
- `YYYYMMDD_HHMMSS_real-router.txt` - real-router results

### `compare.mjs` - Results Analysis

Script for comparing benchmark results between router5 and real-router.

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

The script shows:

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
   - Number of tests with lower/higher consumption
   - Average memory difference

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

The benchmarks are organized into categories:

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
│   │   ├── router-adapter.ts    # Adapter for router5/real-router
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
│   └── router5/                 # router5 results by category
├── .bench-results/              # Text results from bench-compare.sh
├── bench-compare.sh             # Comparative benchmark runner
├── compare.mjs                  # Results analysis script
├── package.json
├── tsconfig.json
└── README.md
```

## Environment Variables

| Variable       | Values                   | Description                     |
| -------------- | ------------------------ | ------------------------------- |
| `BENCH_ROUTER` | `real-router`, `router5` | Which router to benchmark       |
| `COOLDOWN`     | number (seconds)         | Cooldown between benchmark runs |

## Recommendations

1. **Run benchmarks under identical conditions:**
   - Close unnecessary applications
   - Use `sudo` for bench-compare.sh
   - Let the system cool down between runs

2. **Interpreting results:**
   - Small differences (<5%) may be statistical noise
   - Pay attention to patterns (which operation types are slower/faster)
   - Compare results from multiple runs

3. **Troubleshooting:**
   - If results vary significantly between runs - check system load
   - Increase COOLDOWN period for more stable results
   - Run benchmarks on a MacBook connected to power

## Technical Details

- **Benchmarking library**: [mitata](https://github.com/evanwashere/mitata)
- **Runtime**: tsx (TypeScript execution)
- **Memory tracking**: Uses `--expose-gc` for heap measurements
- **Results format**: JSON files per category in `.bench/`
