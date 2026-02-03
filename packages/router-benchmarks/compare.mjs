#!/usr/bin/env node

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, ".bench-results");
const BENCH_DIR = join(__dirname, ".bench");

// ANSI colors
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";
const BOLD = "\x1b[1m";

/**
 * Remove ANSI escape codes from string
 */
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Parse time value to microseconds
 */
function parseTime(timeStr) {
  const cleaned = stripAnsi(timeStr).trim();
  const match = cleaned.match(/([\d.]+)\s*(ns|µs|ms|s)/);

  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2];

  switch (unit) {
    case "ns":
      return value / 1000;
    case "µs":
      return value;
    case "ms":
      return value * 1000;
    case "s":
      return value * 1000000;
    default:
      return null;
  }
}

/**
 * Parse memory value to KB
 */
function parseMemory(memStr) {
  const cleaned = stripAnsi(memStr).trim();
  const match = cleaned.match(/([\d.]+)\s*(b|kb|mb|gb)/i);

  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "b":
      return value / 1024;
    case "kb":
      return value;
    case "mb":
      return value * 1024;
    case "gb":
      return value * 1024 * 1024;
    default:
      return null;
  }
}

/**
 * Parse benchmark results from file
 */
function parseBenchmarkFile(filepath) {
  const content = readFileSync(filepath, "utf-8");
  const lines = content.split("\n");

  const results = new Map();
  let currentBenchmark = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = stripAnsi(line).trim();

    // Skip header and separator lines
    if (
      stripped.startsWith("benchmark") ||
      stripped.startsWith("---") ||
      !stripped
    ) {
      continue;
    }

    // Skip lines that start with '(' or 'gc(' (these are sub-lines, not benchmarks)
    if (stripped.startsWith("(") || stripped.startsWith("gc(")) {
      continue;
    }

    // Check if this is a benchmark name line (contains average time with /iter suffix)
    if (line.includes("/iter")) {
      // Extract benchmark name (everything before the time)
      // Time format: "36.20 µs/iter" - must end with /iter to avoid matching numbers in names
      const nameMatch = stripped.match(
        /^(.+?)\s+([\d.]+\s*(?:ns|µs|ms|s))\/iter/,
      );

      if (nameMatch) {
        const name = nameMatch[1].trim();
        const avgTime = nameMatch[2];

        currentBenchmark = {
          name,
          avgMicroseconds: parseTime(avgTime),
          avgRaw: avgTime,
        };

        // Try to get min/max from next line if it exists
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const nextStripped = stripAnsi(nextLine).trim();
          const minMaxMatch = nextStripped.match(
            /\(([\d.]+\s*(?:ns|µs|ms|s))\s*…\s*([\d.]+\s*(?:ns|µs|ms|s))\)/,
          );

          if (minMaxMatch) {
            currentBenchmark.minMicroseconds = parseTime(minMaxMatch[1]);
            currentBenchmark.maxMicroseconds = parseTime(minMaxMatch[2]);
          }
        }

        // Try to get GC and memory from two lines ahead
        if (i + 2 < lines.length) {
          const gcLine = lines[i + 2];
          const gcStripped = stripAnsi(gcLine).trim();

          // Parse memory allocation
          const memMatch = gcStripped.match(
            /\)\s+([\d.]+\s*(?:b|kb|mb|gb))\s*\(/i,
          );
          if (memMatch) {
            currentBenchmark.memoryKb = parseMemory(memMatch[1]);
            currentBenchmark.memoryRaw = memMatch[1];
          }
        }

        results.set(name, currentBenchmark);
      }
    }
  }

  return results;
}

/**
 * Format time in appropriate unit
 */
function formatTime(microseconds) {
  if (microseconds < 0.1) {
    // For very small values, show more precision to avoid misleading rounding
    return `${(microseconds * 1000).toFixed(2)} ns`;
  } else if (microseconds < 1000) {
    return `${microseconds.toFixed(2)} µs`;
  } else if (microseconds < 1000000) {
    return `${(microseconds / 1000).toFixed(2)} ms`;
  } else {
    return `${(microseconds / 1000000).toFixed(2)} s`;
  }
}

/**
 * Format memory in appropriate unit
 */
function formatMemory(kb) {
  const bytes = kb * 1024;

  if (bytes < 1) {
    return "< 1 b";
  } else if (bytes < 1024) {
    return `${bytes.toFixed(0)} b`;
  } else if (kb < 1024) {
    return `${kb.toFixed(2)} kb`;
  } else if (kb < 1024 * 1024) {
    return `${(kb / 1024).toFixed(2)} mb`;
  } else {
    return `${(kb / (1024 * 1024)).toFixed(2)} gb`;
  }
}

/**
 * Format percentage difference with color and multiplier for large differences
 * Negative diff = better (green), positive = worse (red)
 * @param {number} diff - Percentage difference
 * @param {number|null} baselineValue - Baseline value for ratio calculation
 * @param {number|null} currentValue - Current value for ratio calculation
 * @param {string} type - "time" or "memory" to use appropriate labels
 */
function formatDiff(
  diff,
  baselineValue = null,
  currentValue = null,
  type = "time",
) {
  const sign = diff > 0 ? "+" : "";
  const color = diff > 0 ? RED : GREEN;

  const betterLabel = type === "time" ? "faster" : "lighter";
  const worseLabel = type === "time" ? "slower" : "heavier";

  // For large differences, show multiplier to convey scale better
  if (
    baselineValue !== null &&
    currentValue !== null &&
    baselineValue > 0 &&
    currentValue > 0
  ) {
    const ratio = baselineValue / currentValue;

    if (ratio >= 2) {
      return `${color}${sign}${diff.toFixed(2)}% (${ratio.toFixed(1)}x ${betterLabel})${RESET}`;
    } else if (ratio <= 0.5) {
      return `${color}${sign}${diff.toFixed(2)}% (${(1 / ratio).toFixed(1)}x ${worseLabel})${RESET}`;
    }
  }

  return `${color}${sign}${diff.toFixed(2)}%${RESET}`;
}

/**
 * Format diff for compact display (no multiplier text)
 */
function formatDiffCompact(diff) {
  const sign = diff > 0 ? "+" : "";
  const color = diff > 0 ? RED : GREEN;
  return `${color}${sign}${diff.toFixed(1)}%${RESET}`;
}

/**
 * Load RME data from JSON files in .bench/{router}/ directory
 * Returns a map of benchmark name -> RME value
 */
function loadRmeData(routerName) {
  const rmeMap = new Map();
  const routerBenchDir = join(BENCH_DIR, routerName);

  if (!existsSync(routerBenchDir)) {
    return rmeMap;
  }

  try {
    const files = readdirSync(routerBenchDir).filter((f) =>
      f.endsWith(".json"),
    );

    for (const file of files) {
      const filepath = join(routerBenchDir, file);
      try {
        const content = readFileSync(filepath, "utf-8");
        const benchmarks = JSON.parse(content);

        if (Array.isArray(benchmarks)) {
          for (const benchmark of benchmarks) {
            if (
              benchmark.name &&
              benchmark.stats &&
              benchmark.stats.rme !== undefined
            ) {
              rmeMap.set(benchmark.name, benchmark.stats.rme);
            }
          }
        }
      } catch (e) {
        // Skip files that can't be parsed
      }
    }
  } catch (e) {
    // Directory doesn't exist or can't be read
  }

  return rmeMap;
}

/**
 * Check if RME is high (> 10% = 0.1 as decimal)
 * and return warning message if so
 */
function getRmeWarning(benchmarkName, rmeValue) {
  if (rmeValue > 0.1) {
    const rmePercent = (rmeValue * 100).toFixed(1);
    return `${YELLOW}⚠️ High RME (${rmePercent}%) for "${benchmarkName}" - comparison unreliable${RESET}`;
  }
  return null;
}

/**
 * Category names mapping
 */
const CATEGORY_NAMES = {
  1: "Navigation Basic",
  2: "Navigation Plugins",
  3: "Dependencies",
  4: "Plugins Management",
  5: "Router Options",
  7: "Path Operations",
  8: "Current State",
  9: "Redirects",
  10: "Start/Stop",
  11: "Events",
  12: "Stress Testing",
  13: "Cloning",
};

/**
 * Extract category number from benchmark name
 */
function extractCategory(name) {
  const match = name.match(/^(\d+)\./);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Format category summary with multiplier for large differences
 */
function formatCategorySummary(categoryStats, type = "time") {
  const categories = Array.from(categoryStats.entries()).sort(
    ([a], [b]) => a - b,
  );

  const label = type === "time" ? "Performance" : "Memory";
  const betterLabel = type === "time" ? "faster" : "less memory";
  const worseLabel = type === "time" ? "slower" : "more memory";

  console.log(`\n${BOLD}${label} by Category:${RESET}`);
  console.log("─".repeat(80));

  for (const [category, stats] of categories) {
    const categoryName = CATEGORY_NAMES[category] || `Category ${category}`;
    const avgDiff = stats.totalDiff / stats.count;
    const diffColor = avgDiff > 0 ? RED : GREEN;
    const arrow = avgDiff > 0 ? "▲" : "▼";
    const comparison = avgDiff > 0 ? worseLabel : betterLabel;

    // Calculate multiplier from avgDiff: ratio = 1 / (avgDiff/100 + 1)
    // Show multiplier for large differences (|avgDiff| > 80% ≈ 5x)
    let multiplierStr = "";
    const ratio = 1 / (avgDiff / 100 + 1);

    if (ratio >= 2) {
      multiplierStr = ` ${CYAN}(~${ratio.toFixed(1)}x)${RESET}`;
    } else if (ratio <= 0.5) {
      multiplierStr = ` ${CYAN}(~${(1 / ratio).toFixed(1)}x)${RESET}`;
    }

    console.log(
      `  ${categoryName.padEnd(25)} ${diffColor}${arrow} ${Math.abs(avgDiff).toFixed(1)}% ${comparison}${RESET}${multiplierStr} ` +
        `${GRAY}(${stats.currentBetter}/${stats.count} tests real-router wins)${RESET}`,
    );
  }

  console.log("─".repeat(80));
}

/**
 * Compare two benchmark results (legacy mode)
 */
function compareTwoBenchmarks(baselineFile, currentFile) {
  console.log(`${BOLD}${BLUE}=== Benchmark Comparison ===${RESET}\n`);
  console.log(`${GRAY}router5 (baseline): ${baselineFile}${RESET}`);
  console.log(`${GRAY}real-router (current): ${currentFile}${RESET}\n`);

  const baselineResults = parseBenchmarkFile(join(RESULTS_DIR, baselineFile));
  const currentResults = parseBenchmarkFile(join(RESULTS_DIR, currentFile));

  // Load RME data from JSON files
  const baselineRmeMap = loadRmeData("router5");
  const currentRmeMap = loadRmeData("real-router");

  console.log(`${BOLD}${CYAN}Performance Comparison${RESET}`);
  console.log("─".repeat(120));
  console.log(
    `${"Benchmark".padEnd(70)} ${"router5".padStart(15)} ${"real-router".padStart(15)} ${"Diff".padStart(15)}`,
  );
  console.log("─".repeat(120));

  let totalDiff = 0;
  let count = 0;
  let currentFaster = 0;
  let baselineFaster = 0;
  const categoryStats = new Map();

  for (const [name, baseline] of baselineResults) {
    const current = currentResults.get(name);

    if (!current) {
      console.log(
        `${YELLOW}⚠ ${name.padEnd(68)} ${RESET}${GRAY}missing in real-router${RESET}`,
      );
      continue;
    }

    const diff =
      ((current.avgMicroseconds - baseline.avgMicroseconds) /
        baseline.avgMicroseconds) *
      100;
    totalDiff += diff;
    count++;

    // Track by category
    const category = extractCategory(name);
    if (category !== null) {
      if (!categoryStats.has(category)) {
        categoryStats.set(category, {
          totalDiff: 0,
          count: 0,
          currentBetter: 0,
        });
      }
      const stats = categoryStats.get(category);
      stats.totalDiff += diff;
      stats.count++;
      if (diff < 0) stats.currentBetter++;
    }

    if (diff < 0) {
      currentFaster++;
    } else {
      baselineFaster++;
    }

    const nameDisplay = name.length > 68 ? name.substring(0, 65) + "..." : name;
    const baselineTime = formatTime(baseline.avgMicroseconds).padStart(15);
    const currentTime = formatTime(current.avgMicroseconds).padStart(15);
    const diffDisplay = formatDiff(
      diff,
      baseline.avgMicroseconds,
      current.avgMicroseconds,
    );

    console.log(
      `${nameDisplay.padEnd(70)} ${baselineTime} ${currentTime} ${diffDisplay}`,
    );

    // Check for high RME warnings
    const baselineRme = baselineRmeMap.get(name);
    const currentRme = currentRmeMap.get(name);

    if (baselineRme !== undefined) {
      const warning = getRmeWarning(name, baselineRme);
      if (warning) console.log(warning);
    }

    if (currentRme !== undefined) {
      const warning = getRmeWarning(name, currentRme);
      if (warning) console.log(warning);
    }
  }

  console.log("─".repeat(120));

  console.log(`\n${BOLD}Summary:${RESET}`);
  console.log(`  Total benchmarks: ${count}`);
  console.log(
    `  real-router faster: ${GREEN}${currentFaster}${RESET} (${((currentFaster / count) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  router5 faster: ${RED}${baselineFaster}${RESET} (${((baselineFaster / count) * 100).toFixed(1)}%)`,
  );

  formatCategorySummary(categoryStats, "time");

  // Memory comparison
  console.log(`\n${BOLD}${CYAN}Memory Allocation Comparison${RESET}`);
  console.log("─".repeat(120));
  console.log(
    `${"Benchmark".padEnd(70)} ${"router5".padStart(15)} ${"real-router".padStart(15)} ${"Diff".padStart(15)}`,
  );
  console.log("─".repeat(120));

  let totalMemDiff = 0;
  let memCount = 0;
  let currentLessMem = 0;
  let baselineLessMem = 0;
  const memCategoryStats = new Map();

  for (const [name, baseline] of baselineResults) {
    const current = currentResults.get(name);

    if (!current || !baseline.memoryKb || !current.memoryKb) {
      continue;
    }

    const memDiff =
      ((current.memoryKb - baseline.memoryKb) / baseline.memoryKb) * 100;
    totalMemDiff += memDiff;
    memCount++;

    // Track by category
    const category = extractCategory(name);
    if (category !== null) {
      if (!memCategoryStats.has(category)) {
        memCategoryStats.set(category, {
          totalDiff: 0,
          count: 0,
          currentBetter: 0,
        });
      }
      const stats = memCategoryStats.get(category);
      stats.totalDiff += memDiff;
      stats.count++;
      if (memDiff < 0) stats.currentBetter++;
    }

    if (memDiff < 0) {
      currentLessMem++;
    } else {
      baselineLessMem++;
    }

    const nameDisplay = name.length > 68 ? name.substring(0, 65) + "..." : name;
    const baselineMem = formatMemory(baseline.memoryKb).padStart(15);
    const currentMem = formatMemory(current.memoryKb).padStart(15);
    const diffDisplay = formatDiff(
      memDiff,
      baseline.memoryKb,
      current.memoryKb,
      "memory",
    );

    console.log(
      `${nameDisplay.padEnd(70)} ${baselineMem} ${currentMem} ${diffDisplay}`,
    );

    // Check for high RME warnings
    const baselineRme = baselineRmeMap.get(name);
    const currentRme = currentRmeMap.get(name);

    if (baselineRme !== undefined) {
      const warning = getRmeWarning(name, baselineRme);
      if (warning) console.log(warning);
    }

    if (currentRme !== undefined) {
      const warning = getRmeWarning(name, currentRme);
      if (warning) console.log(warning);
    }
  }

  console.log("─".repeat(120));

  if (memCount > 0) {
    console.log(`\n${BOLD}Memory Summary:${RESET}`);
    console.log(`  Total benchmarks: ${memCount}`);
    console.log(
      `  real-router uses less: ${GREEN}${currentLessMem}${RESET} (${((currentLessMem / memCount) * 100).toFixed(1)}%)`,
    );
    console.log(
      `  router5 uses less: ${RED}${baselineLessMem}${RESET} (${((baselineLessMem / memCount) * 100).toFixed(1)}%)`,
    );

    formatCategorySummary(memCategoryStats, "memory");
  }
}

/**
 * Compare three benchmark results (router5 → router6 → real-router)
 */
function compareThreeBenchmarks(router5File, router6File, realRouterFile) {
  console.log(`${BOLD}${BLUE}=== Three-Way Benchmark Comparison ===${RESET}\n`);
  console.log(`${GRAY}router5 (baseline): ${router5File}${RESET}`);
  console.log(`${GRAY}router6: ${router6File}${RESET}`);
  console.log(`${GRAY}real-router (current): ${realRouterFile}${RESET}\n`);

  const router5Results = parseBenchmarkFile(join(RESULTS_DIR, router5File));
  const router6Results = parseBenchmarkFile(join(RESULTS_DIR, router6File));
  const realRouterResults = parseBenchmarkFile(
    join(RESULTS_DIR, realRouterFile),
  );

  // Load RME data from JSON files
  const router5RmeMap = loadRmeData("router5");
  const router6RmeMap = loadRmeData("router6");
  const realRouterRmeMap = loadRmeData("real-router");

  // Performance comparison
  console.log(`${BOLD}${CYAN}Performance Comparison${RESET}`);
  console.log("─".repeat(150));
  console.log(
    `${"Benchmark".padEnd(50)} ${"router5".padStart(12)} ${"router6".padStart(12)} ${"r6 vs r5".padStart(10)} ${"real-router".padStart(12)} ${"rr vs r5".padStart(10)} ${"rr vs r6".padStart(10)}`,
  );
  console.log("─".repeat(150));

  let count = 0;
  let r6VsR5Better = 0;
  let rrVsR5Better = 0;
  let rrVsR6Better = 0;

  for (const [name, r5] of router5Results) {
    const r6 = router6Results.get(name);
    const rr = realRouterResults.get(name);

    if (!r6 && !rr) {
      console.log(
        `${YELLOW}⚠ ${name.padEnd(48)} ${RESET}${GRAY}missing in router6 and real-router${RESET}`,
      );
      continue;
    }

    count++;

    const nameDisplay = name.length > 48 ? name.substring(0, 45) + "..." : name;
    const r5Time = formatTime(r5.avgMicroseconds).padStart(12);

    let r6Time = GRAY + "N/A".padStart(12) + RESET;
    let r6VsR5Diff = GRAY + "N/A".padStart(10) + RESET;
    if (r6) {
      r6Time = formatTime(r6.avgMicroseconds).padStart(12);
      const diff =
        ((r6.avgMicroseconds - r5.avgMicroseconds) / r5.avgMicroseconds) * 100;
      r6VsR5Diff = formatDiffCompact(diff).padStart(10);
      if (diff < 0) r6VsR5Better++;
    }

    let rrTime = GRAY + "N/A".padStart(12) + RESET;
    let rrVsR5Diff = GRAY + "N/A".padStart(10) + RESET;
    let rrVsR6Diff = GRAY + "N/A".padStart(10) + RESET;
    if (rr) {
      rrTime = formatTime(rr.avgMicroseconds).padStart(12);
      const diffVsR5 =
        ((rr.avgMicroseconds - r5.avgMicroseconds) / r5.avgMicroseconds) * 100;
      rrVsR5Diff = formatDiffCompact(diffVsR5).padStart(10);
      if (diffVsR5 < 0) rrVsR5Better++;

      if (r6) {
        const diffVsR6 =
          ((rr.avgMicroseconds - r6.avgMicroseconds) / r6.avgMicroseconds) *
          100;
        rrVsR6Diff = formatDiffCompact(diffVsR6).padStart(10);
        if (diffVsR6 < 0) rrVsR6Better++;
      }
    }

    console.log(
      `${nameDisplay.padEnd(50)} ${r5Time} ${r6Time} ${r6VsR5Diff} ${rrTime} ${rrVsR5Diff} ${rrVsR6Diff}`,
    );

    // Check for high RME warnings
    const r5Rme = router5RmeMap.get(name);
    const r6Rme = router6RmeMap.get(name);
    const rrRme = realRouterRmeMap.get(name);

    if (r5Rme !== undefined) {
      const warning = getRmeWarning(name, r5Rme);
      if (warning) console.log(warning);
    }

    if (r6Rme !== undefined) {
      const warning = getRmeWarning(name, r6Rme);
      if (warning) console.log(warning);
    }

    if (rrRme !== undefined) {
      const warning = getRmeWarning(name, rrRme);
      if (warning) console.log(warning);
    }
  }

  console.log("─".repeat(150));

  console.log(`\n${BOLD}Performance Summary:${RESET}`);
  console.log(`  Total benchmarks: ${count}`);
  console.log(
    `  router6 faster than router5: ${r6VsR5Better > count / 2 ? GREEN : RED}${r6VsR5Better}${RESET} (${((r6VsR5Better / count) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  real-router faster than router5: ${rrVsR5Better > count / 2 ? GREEN : RED}${rrVsR5Better}${RESET} (${((rrVsR5Better / count) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  real-router faster than router6: ${rrVsR6Better > count / 2 ? GREEN : RED}${rrVsR6Better}${RESET} (${((rrVsR6Better / count) * 100).toFixed(1)}%)`,
  );

  // Memory comparison
  console.log(`\n${BOLD}${CYAN}Memory Allocation Comparison${RESET}`);
  console.log("─".repeat(150));
  console.log(
    `${"Benchmark".padEnd(50)} ${"router5".padStart(12)} ${"router6".padStart(12)} ${"r6 vs r5".padStart(10)} ${"real-router".padStart(12)} ${"rr vs r5".padStart(10)} ${"rr vs r6".padStart(10)}`,
  );
  console.log("─".repeat(150));

  let memCount = 0;
  let r6MemBetter = 0;
  let rrMemVsR5Better = 0;
  let rrMemVsR6Better = 0;

  for (const [name, r5] of router5Results) {
    if (!r5.memoryKb) continue;

    const r6 = router6Results.get(name);
    const rr = realRouterResults.get(name);

    if ((!r6 || !r6.memoryKb) && (!rr || !rr.memoryKb)) continue;

    memCount++;

    const nameDisplay = name.length > 48 ? name.substring(0, 45) + "..." : name;
    const r5Mem = formatMemory(r5.memoryKb).padStart(12);

    let r6Mem = GRAY + "N/A".padStart(12) + RESET;
    let r6MemDiff = GRAY + "N/A".padStart(10) + RESET;
    if (r6 && r6.memoryKb) {
      r6Mem = formatMemory(r6.memoryKb).padStart(12);
      const diff = ((r6.memoryKb - r5.memoryKb) / r5.memoryKb) * 100;
      r6MemDiff = formatDiffCompact(diff).padStart(10);
      if (diff < 0) r6MemBetter++;
    }

    let rrMem = GRAY + "N/A".padStart(12) + RESET;
    let rrMemVsR5 = GRAY + "N/A".padStart(10) + RESET;
    let rrMemVsR6 = GRAY + "N/A".padStart(10) + RESET;
    if (rr && rr.memoryKb) {
      rrMem = formatMemory(rr.memoryKb).padStart(12);
      const diffVsR5 = ((rr.memoryKb - r5.memoryKb) / r5.memoryKb) * 100;
      rrMemVsR5 = formatDiffCompact(diffVsR5).padStart(10);
      if (diffVsR5 < 0) rrMemVsR5Better++;

      if (r6 && r6.memoryKb) {
        const diffVsR6 = ((rr.memoryKb - r6.memoryKb) / r6.memoryKb) * 100;
        rrMemVsR6 = formatDiffCompact(diffVsR6).padStart(10);
        if (diffVsR6 < 0) rrMemVsR6Better++;
      }
    }

    console.log(
      `${nameDisplay.padEnd(50)} ${r5Mem} ${r6Mem} ${r6MemDiff} ${rrMem} ${rrMemVsR5} ${rrMemVsR6}`,
    );

    // Check for high RME warnings
    const r5Rme = router5RmeMap.get(name);
    const r6Rme = router6RmeMap.get(name);
    const rrRme = realRouterRmeMap.get(name);

    if (r5Rme !== undefined) {
      const warning = getRmeWarning(name, r5Rme);
      if (warning) console.log(warning);
    }

    if (r6Rme !== undefined) {
      const warning = getRmeWarning(name, r6Rme);
      if (warning) console.log(warning);
    }

    if (rrRme !== undefined) {
      const warning = getRmeWarning(name, rrRme);
      if (warning) console.log(warning);
    }
  }

  console.log("─".repeat(150));

  if (memCount > 0) {
    console.log(`\n${BOLD}Memory Summary:${RESET}`);
    console.log(`  Total benchmarks: ${memCount}`);
    console.log(
      `  router6 uses less than router5: ${r6MemBetter > memCount / 2 ? GREEN : RED}${r6MemBetter}${RESET} (${((r6MemBetter / memCount) * 100).toFixed(1)}%)`,
    );
    console.log(
      `  real-router uses less than router5: ${rrMemVsR5Better > memCount / 2 ? GREEN : RED}${rrMemVsR5Better}${RESET} (${((rrMemVsR5Better / memCount) * 100).toFixed(1)}%)`,
    );
    console.log(
      `  real-router uses less than router6: ${rrMemVsR6Better > memCount / 2 ? GREEN : RED}${rrMemVsR6Better}${RESET} (${((rrMemVsR6Better / memCount) * 100).toFixed(1)}%)`,
    );
  }
}

/**
 * Get latest benchmark set (pair or triplet)
 */
function getLatestBenchmarkSet() {
  const files = readdirSync(RESULTS_DIR);

  // Group files by timestamp
  const sets = new Map();

  for (const file of files) {
    if (!file.endsWith(".txt")) continue;

    // Match naming: router5, router6, real-router
    const match = file.match(
      /^(\d{8}_\d{6})_(router5|router6|real-router)\.txt$/,
    );
    if (!match) continue;

    const [, timestamp, version] = match;

    if (!sets.has(timestamp)) {
      sets.set(timestamp, {});
    }

    sets.get(timestamp)[version] = file;
  }

  // Find latest complete set (prefer triplet, fallback to pair)
  const timestamps = Array.from(sets.keys()).sort().reverse();

  for (const timestamp of timestamps) {
    const set = sets.get(timestamp);
    // Triplet: all three routers
    if (set["router5"] && set["router6"] && set["real-router"]) {
      return {
        router5: set["router5"],
        router6: set["router6"],
        realRouter: set["real-router"],
        type: "triplet",
      };
    }
    // Pair: router5 and real-router only
    if (set["router5"] && set["real-router"]) {
      return {
        baseline: set["router5"],
        current: set["real-router"],
        type: "pair",
      };
    }
  }

  return null;
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
  // Use latest set (triplet or pair)
  const set = getLatestBenchmarkSet();

  if (!set) {
    console.error(
      `${RED}Error: No complete benchmark sets found in ${RESULTS_DIR}${RESET}`,
    );
    process.exit(1);
  }

  if (set.type === "triplet") {
    compareThreeBenchmarks(set.router5, set.router6, set.realRouter);
  } else {
    compareTwoBenchmarks(set.baseline, set.current);
  }
} else if (args.length === 2) {
  // Two files: pair comparison
  compareTwoBenchmarks(args[0], args[1]);
} else if (args.length === 3) {
  // Three files: triplet comparison
  compareThreeBenchmarks(args[0], args[1], args[2]);
} else {
  console.error(
    `${RED}Usage: ${process.argv[1]} [router5_file router6_file real_router_file]${RESET}`,
  );
  console.error(
    `${RED}   or: ${process.argv[1]} [baseline_file current_file]${RESET}`,
  );
  console.error(
    `${GRAY}If no files specified, uses the latest benchmark set${RESET}`,
  );
  process.exit(1);
}
