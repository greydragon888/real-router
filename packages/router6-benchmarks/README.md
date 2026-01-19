# Router6 Benchmarks

Tools for comparing performance between router5 and router6.

## Scripts

### `bench-compare.sh` - Running Benchmarks

Automated script for running router5 and router6 benchmarks under optimal conditions.

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
5. Runs benchmarks for router6
6. Restores system settings
7. Saves results to `.bench-results/`

**Results:**
- `YYYYMMDD_HHMMSS_router5.txt` - router5 results
- `YYYYMMDD_HHMMSS_router6.txt` - router6 results

### `compare.mjs` - Results Analysis

Script for comparing benchmark results between router5 and router6.

**Usage:**

```bash
# Automatically uses the latest pair of results
./compare.mjs

# Or with node
node compare.mjs

# Compare specific files
./compare.mjs 20260114_085727_router5.txt 20260114_085727_router6.txt
```

**Output:**

The script shows:

1. **Performance Comparison** - execution time comparison
   - Benchmark name
   - router5 time
   - router6 time
   - Percentage difference (green = router6 faster, red = slower)

2. **Summary** - overall performance summary
   - Number of tests where router6 is faster/slower
   - Average performance difference

3. **Memory Allocation Comparison** - memory usage comparison
   - Memory allocations for each test
   - Percentage difference (green = router6 uses less, red = uses more)

4. **Memory Summary** - overall memory summary
   - Number of tests with lower/higher consumption
   - Average memory difference

**Example output:**

```
=== Benchmark Comparison ===

router5: 20260114_085727_router5.txt
router6: 20260114_085727_router6.txt

Performance Comparison
────────────────────────────────────────────────────────────────────────────
Benchmark                                                router5    router6    Diff
────────────────────────────────────────────────────────────────────────────
1.1.1 Simple navigation between routes                  104.86 µs  104.61 µs  -0.24%
1.1.2 Navigation with route parameters                   17.29 µs   23.87 µs  +38.06%
...

Summary:
  Total benchmarks: 432
  router6 faster: 23 (5.3%)
  router5 faster: 409 (94.7%)
  Average difference: +111.61%

✗ router6 is 111.61% slower on average
```

## Directory Structure

```
packages/router6-benchmarks/
├── .bench-results/          # Benchmark results (gitignored)
│   ├── YYYYMMDD_HHMMSS_router5.txt
│   └── YYYYMMDD_HHMMSS_router6.txt
├── bench-compare.sh         # Benchmark runner script
├── compare.mjs              # Results analysis script
└── README.md                # This documentation
```

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
