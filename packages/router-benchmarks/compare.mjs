#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, ".bench-results");
const BENCH_JSON_DIR = join(__dirname, ".bench");

// Anomaly thresholds
const ANOMALY_THRESHOLDS = {
  // rr slower than r6 by this % is anomalous (they should be similar)
  rrVsR6Slowdown: 20,
  // noValidate slower than rr by this % is anomalous (should be faster or equal)
  nvVsRrSlowdown: 5,
  // RME threshold for unstable measurements
  rmeUnstable: 0.3,
  rmeSuspicious: 0.5,
};

// Output capture for saving to file
const outputLines = [];

// ANSI colors
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";
const BOLD = "\x1b[1m";
const MAGENTA = "\x1b[35m";

// Markers for anomalies and unstable measurements
const MARKER_ANOMALY = `${RED}⚠${RESET}`;  // Red warning for anomaly
const MARKER_UNSTABLE = `${YELLOW}~${RESET}`; // Yellow tilde for unstable RME

/**
 * Remove ANSI escape codes from string
 */
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Log to console and capture for file output
 */
function log(str = "") {
  console.log(str);
  outputLines.push(stripAnsi(str));
}

/**
 * Save captured output to file
 */
function saveResults(timestamp) {
  const outputFile = join(RESULTS_DIR, `${timestamp}_comparison.txt`);
  writeFileSync(outputFile, outputLines.join("\n"));
  console.log(`\n${GREEN}Results saved to: ${outputFile}${RESET}`);
}

/**
 * Map section number to JSON filename
 */
const SECTION_TO_FILE = {
  1: "01-navigation-basic.json",
  2: "02-navigation-plugins.json",
  3: "03-dependencies.json",
  4: "04-plugins-management.json",
  5: "05-router-options.json",
  7: "07-path-operations.json",
  8: "08-current-state.json",
  9: "09-redirects.json",
  10: "10-start-stop.json",
  11: "11-events.json",
  12: "12-stress-testing.json",
  13: "13-cloning.json",
};

/**
 * Load RME data from .bench/ JSON files
 * @returns Map<routerName, Map<benchmarkName, rme>>
 */
function loadRmeData() {
  const rmeData = new Map();
  const routers = ["router5", "router6", "real-router", "real-router-novalidate"];

  for (const router of routers) {
    const routerDir = router === "real-router-novalidate"
      ? join(BENCH_JSON_DIR, "real-router") // novalidate uses same dir as real-router
      : join(BENCH_JSON_DIR, router);

    if (!existsSync(routerDir)) continue;

    const routerRme = new Map();

    for (const [section, filename] of Object.entries(SECTION_TO_FILE)) {
      const filepath = join(routerDir, filename);
      if (!existsSync(filepath)) continue;

      try {
        const content = readFileSync(filepath, "utf-8");
        const benchmarks = JSON.parse(content);

        for (const bench of benchmarks) {
          if (bench.name && bench.stats?.rme !== undefined) {
            routerRme.set(bench.name, bench.stats.rme);
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    rmeData.set(router, routerRme);
  }

  return rmeData;
}

/**
 * Check if a measurement is anomalous or unstable
 * @returns { anomaly: string | null, unstable: boolean, rme: number | null }
 */
function checkMeasurement(name, routerName, rmeData, diff, type = "rrVsR6") {
  const result = { anomaly: null, unstable: false, rme: null };

  // Get RME for this measurement
  const routerRme = rmeData.get(routerName);
  if (routerRme) {
    result.rme = routerRme.get(name) ?? null;
    if (result.rme !== null) {
      result.unstable = result.rme > ANOMALY_THRESHOLDS.rmeUnstable;
    }
  }

  // Check for anomalies based on type
  if (type === "rrVsR6" && diff > ANOMALY_THRESHOLDS.rrVsR6Slowdown) {
    result.anomaly = `rr +${diff.toFixed(0)}% vs r6`;
  } else if (type === "nvVsRr" && diff > ANOMALY_THRESHOLDS.nvVsRrSlowdown) {
    result.anomaly = `nv +${diff.toFixed(0)}% vs rr`;
  }

  return result;
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
 * @param {number} diff - Percentage difference
 * @param {number} width - Optional width for padding (default 0 = no padding)
 */
function formatDiffCompact(diff, width = 0) {
  const sign = diff > 0 ? "+" : "";
  const color = diff > 0 ? RED : GREEN;
  const text = `${sign}${diff.toFixed(1)}%`;
  const padded = width > 0 ? text.padStart(width) : text;
  return `${color}${padded}${RESET}`;
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

  log(`\n${BOLD}${label} by Category:${RESET}`);
  log("─".repeat(80));

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

    log(
      `  ${categoryName.padEnd(25)} ${diffColor}${arrow} ${Math.abs(avgDiff).toFixed(1)}% ${comparison}${RESET}${multiplierStr} ` +
        `${GRAY}(${stats.currentBetter}/${stats.count} tests real-router wins)${RESET}`,
    );
  }

  log("─".repeat(80));
}

/**
 * Compare two benchmark results (legacy mode)
 */
function compareTwoBenchmarks(baselineFile, currentFile) {
  log(`${BOLD}${BLUE}=== Benchmark Comparison ===${RESET}\n`);
  log(`${GRAY}router5 (baseline): ${baselineFile}${RESET}`);
  log(`${GRAY}real-router (current): ${currentFile}${RESET}\n`);

  const baselineResults = parseBenchmarkFile(join(RESULTS_DIR, baselineFile));
  const currentResults = parseBenchmarkFile(join(RESULTS_DIR, currentFile));

  log(`${BOLD}${CYAN}Performance Comparison${RESET}`);
  log("─".repeat(120));
  log(
    `${"Benchmark".padEnd(70)} ${"router5".padStart(15)} ${"real-router".padStart(15)} ${"Diff".padStart(15)}`,
  );
  log("─".repeat(120));

  let totalDiff = 0;
  let count = 0;
  let currentFaster = 0;
  let baselineFaster = 0;
  const categoryStats = new Map();

  for (const [name, baseline] of baselineResults) {
    const current = currentResults.get(name);

    if (!current) {
      log(
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

    log(
      `${nameDisplay.padEnd(70)} ${baselineTime} ${currentTime} ${diffDisplay}`,
    );
  }

  log("─".repeat(120));

  log(`\n${BOLD}Summary:${RESET}`);
  log(`  Total benchmarks: ${count}`);
  log(
    `  real-router faster: ${GREEN}${currentFaster}${RESET} (${((currentFaster / count) * 100).toFixed(1)}%)`,
  );
  log(
    `  router5 faster: ${RED}${baselineFaster}${RESET} (${((baselineFaster / count) * 100).toFixed(1)}%)`,
  );

  formatCategorySummary(categoryStats, "time");

  // Memory comparison
  log(`\n${BOLD}${CYAN}Memory Allocation Comparison${RESET}`);
  log("─".repeat(120));
  log(
    `${"Benchmark".padEnd(70)} ${"router5".padStart(15)} ${"real-router".padStart(15)} ${"Diff".padStart(15)}`,
  );
  log("─".repeat(120));

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

    log(
      `${nameDisplay.padEnd(70)} ${baselineMem} ${currentMem} ${diffDisplay}`,
    );
  }

  log("─".repeat(120));

  if (memCount > 0) {
    log(`\n${BOLD}Memory Summary:${RESET}`);
    log(`  Total benchmarks: ${memCount}`);
    log(
      `  real-router uses less: ${GREEN}${currentLessMem}${RESET} (${((currentLessMem / memCount) * 100).toFixed(1)}%)`,
    );
    log(
      `  router5 uses less: ${RED}${baselineLessMem}${RESET} (${((baselineLessMem / memCount) * 100).toFixed(1)}%)`,
    );

    formatCategorySummary(memCategoryStats, "memory");
  }
}

/**
 * Compare three benchmark results (router5 → router6 → real-router)
 */
function compareThreeBenchmarks(router5File, router6File, realRouterFile) {
  log(`${BOLD}${BLUE}=== Three-Way Benchmark Comparison ===${RESET}\n`);
  log(`${GRAY}router5 (baseline): ${router5File}${RESET}`);
  log(`${GRAY}router6: ${router6File}${RESET}`);
  log(`${GRAY}real-router (current): ${realRouterFile}${RESET}\n`);

  const router5Results = parseBenchmarkFile(join(RESULTS_DIR, router5File));
  const router6Results = parseBenchmarkFile(join(RESULTS_DIR, router6File));
  const realRouterResults = parseBenchmarkFile(join(RESULTS_DIR, realRouterFile));

  // Performance comparison
  log(`${BOLD}${CYAN}Performance Comparison${RESET}`);
  log("─".repeat(150));
  log(
    `${"Benchmark".padEnd(50)} ${"router5".padStart(12)} ${"router6".padStart(12)} ${"r6 vs r5".padStart(10)} ${"real-router".padStart(12)} ${"rr vs r5".padStart(10)} ${"rr vs r6".padStart(10)}`,
  );
  log("─".repeat(150));

  let count = 0;
  let r6VsR5Better = 0;
  let rrVsR5Better = 0;
  let rrVsR6Better = 0;

  for (const [name, r5] of router5Results) {
    const r6 = router6Results.get(name);
    const rr = realRouterResults.get(name);

    if (!r6 && !rr) {
      log(`${YELLOW}⚠ ${name.padEnd(48)} ${RESET}${GRAY}missing in router6 and real-router${RESET}`);
      continue;
    }

    count++;

    const nameDisplay = name.length > 48 ? name.substring(0, 45) + "..." : name;
    const r5Time = formatTime(r5.avgMicroseconds).padStart(12);

    let r6Time = GRAY + "N/A".padStart(12) + RESET;
    let r6VsR5Diff = GRAY + "N/A".padStart(10) + RESET;
    if (r6) {
      r6Time = formatTime(r6.avgMicroseconds).padStart(12);
      const diff = ((r6.avgMicroseconds - r5.avgMicroseconds) / r5.avgMicroseconds) * 100;
      r6VsR5Diff = formatDiffCompact(diff).padStart(10);
      if (diff < 0) r6VsR5Better++;
    }

    let rrTime = GRAY + "N/A".padStart(12) + RESET;
    let rrVsR5Diff = GRAY + "N/A".padStart(10) + RESET;
    let rrVsR6Diff = GRAY + "N/A".padStart(10) + RESET;
    if (rr) {
      rrTime = formatTime(rr.avgMicroseconds).padStart(12);
      const diffVsR5 = ((rr.avgMicroseconds - r5.avgMicroseconds) / r5.avgMicroseconds) * 100;
      rrVsR5Diff = formatDiffCompact(diffVsR5).padStart(10);
      if (diffVsR5 < 0) rrVsR5Better++;

      if (r6) {
        const diffVsR6 = ((rr.avgMicroseconds - r6.avgMicroseconds) / r6.avgMicroseconds) * 100;
        rrVsR6Diff = formatDiffCompact(diffVsR6).padStart(10);
        if (diffVsR6 < 0) rrVsR6Better++;
      }
    }

    log(`${nameDisplay.padEnd(50)} ${r5Time} ${r6Time} ${r6VsR5Diff} ${rrTime} ${rrVsR5Diff} ${rrVsR6Diff}`);
  }

  log("─".repeat(150));

  log(`\n${BOLD}Performance Summary:${RESET}`);
  log(`  Total benchmarks: ${count}`);
  log(`  router6 faster than router5: ${r6VsR5Better > count/2 ? GREEN : RED}${r6VsR5Better}${RESET} (${((r6VsR5Better / count) * 100).toFixed(1)}%)`);
  log(`  real-router faster than router5: ${rrVsR5Better > count/2 ? GREEN : RED}${rrVsR5Better}${RESET} (${((rrVsR5Better / count) * 100).toFixed(1)}%)`);
  log(`  real-router faster than router6: ${rrVsR6Better > count/2 ? GREEN : RED}${rrVsR6Better}${RESET} (${((rrVsR6Better / count) * 100).toFixed(1)}%)`);

  // Memory comparison
  log(`\n${BOLD}${CYAN}Memory Allocation Comparison${RESET}`);
  log("─".repeat(150));
  log(
    `${"Benchmark".padEnd(50)} ${"router5".padStart(12)} ${"router6".padStart(12)} ${"r6 vs r5".padStart(10)} ${"real-router".padStart(12)} ${"rr vs r5".padStart(10)} ${"rr vs r6".padStart(10)}`,
  );
  log("─".repeat(150));

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

    log(`${nameDisplay.padEnd(50)} ${r5Mem} ${r6Mem} ${r6MemDiff} ${rrMem} ${rrMemVsR5} ${rrMemVsR6}`);
  }

  log("─".repeat(150));

  if (memCount > 0) {
    log(`\n${BOLD}Memory Summary:${RESET}`);
    log(`  Total benchmarks: ${memCount}`);
    log(`  router6 uses less than router5: ${r6MemBetter > memCount/2 ? GREEN : RED}${r6MemBetter}${RESET} (${((r6MemBetter / memCount) * 100).toFixed(1)}%)`);
    log(`  real-router uses less than router5: ${rrMemVsR5Better > memCount/2 ? GREEN : RED}${rrMemVsR5Better}${RESET} (${((rrMemVsR5Better / memCount) * 100).toFixed(1)}%)`);
    log(`  real-router uses less than router6: ${rrMemVsR6Better > memCount/2 ? GREEN : RED}${rrMemVsR6Better}${RESET} (${((rrMemVsR6Better / memCount) * 100).toFixed(1)}%)`);
  }
}

/**
 * Compare four benchmark results (router5 → router6 → real-router → real-router-novalidate)
 */
function compareFourBenchmarks(router5File, router6File, realRouterFile, realRouterNoValidateFile) {
  log(`${BOLD}${BLUE}=== Four-Way Benchmark Comparison ===${RESET}\n`);
  log(`${GRAY}r5     = router5 (baseline): ${router5File}${RESET}`);
  log(`${GRAY}r6     = router6: ${router6File}${RESET}`);
  log(`${GRAY}rr     = real-router: ${realRouterFile}${RESET}`);
  log(`${GRAY}rr(nv) = real-router (noValidate: true): ${realRouterNoValidateFile}${RESET}\n`);
  log(`${GRAY}Legend: ${MARKER_ANOMALY} anomaly (unexpected slowdown)  ${MARKER_UNSTABLE} unstable (RME>${ANOMALY_THRESHOLDS.rmeUnstable})${RESET}\n`);

  const router5Results = parseBenchmarkFile(join(RESULTS_DIR, router5File));
  const router6Results = parseBenchmarkFile(join(RESULTS_DIR, router6File));
  const realRouterResults = parseBenchmarkFile(join(RESULTS_DIR, realRouterFile));
  const noValidateResults = parseBenchmarkFile(join(RESULTS_DIR, realRouterNoValidateFile));

  // Load RME data for stability analysis
  const rmeData = loadRmeData();

  // Collect anomalies for summary
  const anomalies = [];

  // Performance comparison
  log(`${BOLD}${CYAN}Performance Comparison${RESET}`);
  log("─".repeat(160));
  log(
    `${"".padEnd(3)}${"Benchmark".padEnd(37)} │ ${"r5".padStart(10)} ${"r6".padStart(10)} ${"rr".padStart(10)} ${"rr(nv)".padStart(10)} │ ${"rr/r5".padStart(10)} ${"rr/r6".padStart(10)} ${"nv/rr".padStart(10)}`,
  );
  log("─".repeat(160));

  let count = 0;
  let rrVsR5Better = 0;
  let rrVsR6Better = 0;
  let nvVsRrBetter = 0;

  for (const [name, r5] of router5Results) {
    const r6 = router6Results.get(name);
    const rr = realRouterResults.get(name);
    const nv = noValidateResults.get(name);

    if (!r6 && !rr && !nv) {
      log(`   ${YELLOW}⚠ ${name.padEnd(37)} ${RESET}${GRAY}missing in all variants${RESET}`);
      continue;
    }

    count++;

    const nameDisplay = name.length > 37 ? name.substring(0, 34) + "..." : name;
    const r5Time = formatTime(r5.avgMicroseconds).padStart(10);

    let r6Time = GRAY + "N/A".padStart(10) + RESET;
    if (r6) {
      r6Time = formatTime(r6.avgMicroseconds).padStart(10);
    }

    // Get RME data first for stability markers
    const rrRme = rmeData.get("real-router")?.get(name);
    const r6Rme = rmeData.get("router6")?.get(name);
    const rrVsR6Unstable = (rrRme && rrRme > ANOMALY_THRESHOLDS.rmeUnstable) ||
                           (r6Rme && r6Rme > ANOMALY_THRESHOLDS.rmeUnstable);
    const nvVsRrUnstable = rrRme && rrRme > ANOMALY_THRESHOLDS.rmeUnstable;

    let rrTime = GRAY + "N/A".padStart(10) + RESET;
    let rrVsR5Diff = GRAY + "N/A".padStart(10) + RESET;
    let rrVsR6Diff = GRAY + "N/A".padStart(10) + RESET;
    let diffVsR6Raw = null;
    if (rr) {
      rrTime = formatTime(rr.avgMicroseconds).padStart(10);
      const diffVsR5 = ((rr.avgMicroseconds - r5.avgMicroseconds) / r5.avgMicroseconds) * 100;
      rrVsR5Diff = formatDiffCompact(diffVsR5, 10);
      if (diffVsR5 < 0) rrVsR5Better++;

      if (r6) {
        diffVsR6Raw = ((rr.avgMicroseconds - r6.avgMicroseconds) / r6.avgMicroseconds) * 100;
        rrVsR6Diff = formatDiffCompact(diffVsR6Raw, 10);
        if (diffVsR6Raw < 0) rrVsR6Better++;
        // Add unstable marker to diff
        if (rrVsR6Unstable) {
          rrVsR6Diff = rrVsR6Diff.replace(RESET, YELLOW + "~" + RESET);
        }
      }
    }

    let nvTime = GRAY + "N/A".padStart(10) + RESET;
    let nvVsRrDiff = GRAY + "N/A".padStart(10) + RESET;
    let diffVsRrRaw = null;
    if (nv) {
      nvTime = formatTime(nv.avgMicroseconds).padStart(10);
      if (rr) {
        diffVsRrRaw = ((nv.avgMicroseconds - rr.avgMicroseconds) / rr.avgMicroseconds) * 100;
        nvVsRrDiff = formatDiffCompact(diffVsRrRaw, 10);
        if (diffVsRrRaw < 0) nvVsRrBetter++;
        // Add unstable marker to diff
        if (nvVsRrUnstable) {
          nvVsRrDiff = nvVsRrDiff.replace(RESET, YELLOW + "~" + RESET);
        }
      }
    }

    // Check for anomalies
    let markers = "   ";
    const rowAnomalies = [];

    // Check rr vs r6 anomaly
    if (diffVsR6Raw !== null && diffVsR6Raw > ANOMALY_THRESHOLDS.rrVsR6Slowdown) {
      rowAnomalies.push({ type: "rrVsR6", diff: diffVsR6Raw, name });
    }

    // Check nv vs rr anomaly (noValidate should be faster or equal)
    if (diffVsRrRaw !== null && diffVsRrRaw > ANOMALY_THRESHOLDS.nvVsRrSlowdown) {
      rowAnomalies.push({ type: "nvVsRr", diff: diffVsRrRaw, name });
    }

    // Set row marker (anomaly takes precedence)
    if (rowAnomalies.length > 0) {
      markers = MARKER_ANOMALY + "  ";
      for (const a of rowAnomalies) {
        anomalies.push({
          ...a,
          rrRme,
          r6Rme,
          unstable: rrVsR6Unstable,
        });
      }
    } else if (rrVsR6Unstable) {
      markers = MARKER_UNSTABLE + "  ";
    }

    log(`${markers}${nameDisplay.padEnd(37)} │ ${r5Time} ${r6Time} ${rrTime} ${nvTime} │ ${rrVsR5Diff} ${rrVsR6Diff} ${nvVsRrDiff}`);
  }

  log("─".repeat(160));

  log(`\n${BOLD}Performance Summary:${RESET}`);
  log(`  Total benchmarks: ${count}`);
  log(`  rr faster than r5: ${rrVsR5Better > count/2 ? GREEN : RED}${rrVsR5Better}${RESET} (${((rrVsR5Better / count) * 100).toFixed(1)}%)`);
  log(`  rr faster than r6: ${rrVsR6Better > count/2 ? GREEN : RED}${rrVsR6Better}${RESET} (${((rrVsR6Better / count) * 100).toFixed(1)}%)`);
  log(`  rr(nv) faster than rr: ${nvVsRrBetter > count/2 ? GREEN : RED}${nvVsRrBetter}${RESET} (${((nvVsRrBetter / count) * 100).toFixed(1)}%)`);

  // Memory comparison
  const memAnomalies = [];

  log(`\n${BOLD}${CYAN}Memory Allocation Comparison${RESET}`);
  log("─".repeat(160));
  log(
    `${"".padEnd(3)}${"Benchmark".padEnd(37)} │ ${"r5".padStart(10)} ${"r6".padStart(10)} ${"rr".padStart(10)} ${"rr(nv)".padStart(10)} │ ${"rr/r5".padStart(10)} ${"rr/r6".padStart(10)} ${"nv/rr".padStart(10)}`,
  );
  log("─".repeat(160));

  let memCount = 0;
  let rrMemVsR5Better = 0;
  let rrMemVsR6Better = 0;
  let nvMemVsRrBetter = 0;

  for (const [name, r5] of router5Results) {
    if (!r5.memoryKb) continue;

    const r6 = router6Results.get(name);
    const rr = realRouterResults.get(name);
    const nv = noValidateResults.get(name);

    if ((!r6 || !r6.memoryKb) && (!rr || !rr.memoryKb) && (!nv || !nv.memoryKb)) continue;

    memCount++;

    const nameDisplay = name.length > 37 ? name.substring(0, 34) + "..." : name;
    const r5Mem = formatMemory(r5.memoryKb).padStart(10);

    let r6Mem = GRAY + "N/A".padStart(10) + RESET;
    if (r6 && r6.memoryKb) {
      r6Mem = formatMemory(r6.memoryKb).padStart(10);
    }

    let rrMem = GRAY + "N/A".padStart(10) + RESET;
    let rrMemVsR5 = GRAY + "N/A".padStart(10) + RESET;
    let rrMemVsR6 = GRAY + "N/A".padStart(10) + RESET;
    let memDiffVsR6Raw = null;
    if (rr && rr.memoryKb) {
      rrMem = formatMemory(rr.memoryKb).padStart(10);
      const diffVsR5 = ((rr.memoryKb - r5.memoryKb) / r5.memoryKb) * 100;
      rrMemVsR5 = formatDiffCompact(diffVsR5, 10);
      if (diffVsR5 < 0) rrMemVsR5Better++;

      if (r6 && r6.memoryKb) {
        memDiffVsR6Raw = ((rr.memoryKb - r6.memoryKb) / r6.memoryKb) * 100;
        rrMemVsR6 = formatDiffCompact(memDiffVsR6Raw, 10);
        if (memDiffVsR6Raw < 0) rrMemVsR6Better++;
      }
    }

    let nvMem = GRAY + "N/A".padStart(10) + RESET;
    let nvMemVsRr = GRAY + "N/A".padStart(10) + RESET;
    let memDiffVsRrRaw = null;
    if (nv && nv.memoryKb) {
      nvMem = formatMemory(nv.memoryKb).padStart(10);
      if (rr && rr.memoryKb) {
        memDiffVsRrRaw = ((nv.memoryKb - rr.memoryKb) / rr.memoryKb) * 100;
        nvMemVsRr = formatDiffCompact(memDiffVsRrRaw, 10);
        if (memDiffVsRrRaw < 0) nvMemVsRrBetter++;
      }
    }

    // Check for memory anomalies
    let markers = "   ";
    const rowMemAnomalies = [];

    // Check rr vs r6 memory anomaly (rr using much more memory)
    if (memDiffVsR6Raw !== null && memDiffVsR6Raw > ANOMALY_THRESHOLDS.rrVsR6Slowdown) {
      rowMemAnomalies.push({ type: "memRrVsR6", diff: memDiffVsR6Raw, name });
    }

    // Check nv vs rr memory anomaly
    if (memDiffVsRrRaw !== null && memDiffVsRrRaw > ANOMALY_THRESHOLDS.nvVsRrSlowdown) {
      rowMemAnomalies.push({ type: "memNvVsRr", diff: memDiffVsRrRaw, name });
    }

    // Check RME stability
    const rrRme = rmeData.get("real-router")?.get(name);
    const r6Rme = rmeData.get("router6")?.get(name);
    const isUnstable = (rrRme && rrRme > ANOMALY_THRESHOLDS.rmeUnstable) ||
                       (r6Rme && r6Rme > ANOMALY_THRESHOLDS.rmeUnstable);

    if (rowMemAnomalies.length > 0) {
      markers = MARKER_ANOMALY + "  ";
      for (const a of rowMemAnomalies) {
        memAnomalies.push({
          ...a,
          rrRme,
          r6Rme,
          unstable: isUnstable,
        });
      }
    } else if (isUnstable) {
      markers = MARKER_UNSTABLE + "  ";
    }

    log(`${markers}${nameDisplay.padEnd(37)} │ ${r5Mem} ${r6Mem} ${rrMem} ${nvMem} │ ${rrMemVsR5} ${rrMemVsR6} ${nvMemVsRr}`);
  }

  log("─".repeat(160));

  if (memCount > 0) {
    log(`\n${BOLD}Memory Summary:${RESET}`);
    log(`  Total benchmarks: ${memCount}`);
    log(`  rr uses less than r5: ${rrMemVsR5Better > memCount/2 ? GREEN : RED}${rrMemVsR5Better}${RESET} (${((rrMemVsR5Better / memCount) * 100).toFixed(1)}%)`);
    log(`  rr uses less than r6: ${rrMemVsR6Better > memCount/2 ? GREEN : RED}${rrMemVsR6Better}${RESET} (${((rrMemVsR6Better / memCount) * 100).toFixed(1)}%)`);
    log(`  rr(nv) uses less than rr: ${nvMemVsRrBetter > memCount/2 ? GREEN : RED}${nvMemVsRrBetter}${RESET} (${((nvMemVsRrBetter / memCount) * 100).toFixed(1)}%)`);
  }

  // Print anomaly summary
  const allAnomalies = [...anomalies, ...memAnomalies];
  if (allAnomalies.length > 0) {
    log(`\n${BOLD}${RED}=== Anomalies Detected (${allAnomalies.length}) ===${RESET}`);
    log(`${GRAY}Anomaly = unexpected slowdown. Check RME for stability.${RESET}`);
    log("─".repeat(100));

    // Group by type
    const rrVsR6Anomalies = allAnomalies.filter(a => a.type === "rrVsR6" || a.type === "memRrVsR6");
    const nvVsRrAnomalies = allAnomalies.filter(a => a.type === "nvVsRr" || a.type === "memNvVsRr");

    if (rrVsR6Anomalies.length > 0) {
      log(`\n${YELLOW}rr slower than r6 (threshold: >${ANOMALY_THRESHOLDS.rrVsR6Slowdown}%):${RESET}`);
      for (const a of rrVsR6Anomalies) {
        const typeLabel = a.type.startsWith("mem") ? "(memory)" : "(time)";
        const rmeInfo = a.rrRme !== undefined || a.r6Rme !== undefined
          ? ` ${GRAY}[RME: rr=${a.rrRme?.toFixed(2) ?? "?"}, r6=${a.r6Rme?.toFixed(2) ?? "?"}]${RESET}`
          : "";
        const unstableTag = a.unstable ? ` ${YELLOW}~unstable${RESET}` : "";
        log(`  ${MARKER_ANOMALY} ${a.name.substring(0, 60).padEnd(60)} ${RED}+${a.diff.toFixed(1)}%${RESET} ${typeLabel}${rmeInfo}${unstableTag}`);
      }
    }

    if (nvVsRrAnomalies.length > 0) {
      log(`\n${YELLOW}noValidate slower than rr (threshold: >${ANOMALY_THRESHOLDS.nvVsRrSlowdown}%):${RESET}`);
      for (const a of nvVsRrAnomalies) {
        const typeLabel = a.type.startsWith("mem") ? "(memory)" : "(time)";
        const rmeInfo = a.rrRme !== undefined || a.r6Rme !== undefined
          ? ` ${GRAY}[RME: rr=${a.rrRme?.toFixed(2) ?? "?"}, r6=${a.r6Rme?.toFixed(2) ?? "?"}]${RESET}`
          : "";
        const unstableTag = a.unstable ? ` ${YELLOW}~unstable${RESET}` : "";
        log(`  ${MARKER_ANOMALY} ${a.name.substring(0, 60).padEnd(60)} ${RED}+${a.diff.toFixed(1)}%${RESET} ${typeLabel}${rmeInfo}${unstableTag}`);
      }
    }

    log("─".repeat(100));
    log(`${GRAY}Note: Anomalies with high RME (>0.5) are likely measurement artifacts, not real regressions.${RESET}`);
  } else {
    log(`\n${GREEN}✓ No anomalies detected.${RESET}`);
  }
}

/**
 * Get latest benchmark set (pair, triplet, or quartet)
 */
function getLatestBenchmarkSet() {
  const files = readdirSync(RESULTS_DIR);

  // Group files by timestamp
  const sets = new Map();

  for (const file of files) {
    if (!file.endsWith(".txt")) continue;

    // Match naming: router5, router6, real-router, real-router-novalidate
    const match = file.match(/^(\d{8}_\d{6})_(router5|router6|real-router-novalidate|real-router)\.txt$/);
    if (!match) continue;

    const [, timestamp, version] = match;

    if (!sets.has(timestamp)) {
      sets.set(timestamp, {});
    }

    sets.get(timestamp)[version] = file;
  }

  // Find latest complete set (prefer quartet, then triplet, fallback to pair)
  const timestamps = Array.from(sets.keys()).sort().reverse();

  for (const timestamp of timestamps) {
    const set = sets.get(timestamp);
    // Quartet: all four variants
    if (set["router5"] && set["router6"] && set["real-router"] && set["real-router-novalidate"]) {
      return {
        router5: set["router5"],
        router6: set["router6"],
        realRouter: set["real-router"],
        realRouterNoValidate: set["real-router-novalidate"],
        type: "quartet",
      };
    }
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

/**
 * Extract timestamp from filename
 */
function extractTimestamp(filename) {
  const match = filename.match(/^(\d{8}_\d{6})/);
  return match ? match[1] : null;
}

// Main
const args = process.argv.slice(2);
let timestamp = null;

if (args.length === 0) {
  // Use latest set (quartet, triplet, or pair)
  const set = getLatestBenchmarkSet();

  if (!set) {
    console.error(
      `${RED}Error: No complete benchmark sets found in ${RESULTS_DIR}${RESET}`,
    );
    process.exit(1);
  }

  // Extract timestamp from first file
  const firstFile = set.router5 || set.baseline;
  timestamp = extractTimestamp(firstFile);

  if (set.type === "quartet") {
    compareFourBenchmarks(set.router5, set.router6, set.realRouter, set.realRouterNoValidate);
  } else if (set.type === "triplet") {
    compareThreeBenchmarks(set.router5, set.router6, set.realRouter);
  } else {
    compareTwoBenchmarks(set.baseline, set.current);
  }
} else if (args.length === 2) {
  // Two files: pair comparison
  timestamp = extractTimestamp(args[0]);
  compareTwoBenchmarks(args[0], args[1]);
} else if (args.length === 3) {
  // Three files: triplet comparison
  timestamp = extractTimestamp(args[0]);
  compareThreeBenchmarks(args[0], args[1], args[2]);
} else if (args.length === 4) {
  // Four files: quartet comparison
  timestamp = extractTimestamp(args[0]);
  compareFourBenchmarks(args[0], args[1], args[2], args[3]);
} else {
  console.error(
    `${RED}Usage: ${process.argv[1]} [router5 router6 real-router real-router-novalidate]${RESET}`,
  );
  console.error(
    `${RED}   or: ${process.argv[1]} [router5 router6 real-router]${RESET}`,
  );
  console.error(
    `${RED}   or: ${process.argv[1]} [baseline current]${RESET}`,
  );
  console.error(
    `${GRAY}If no files specified, uses the latest benchmark set${RESET}`,
  );
  process.exit(1);
}

// Save results to file
if (timestamp) {
  saveResults(timestamp);
}
