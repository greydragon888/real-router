#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, ".bench-results");

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
 * Negative diff = real-router better (green), positive = real-router worse (red)
 * @param {number} diff - Percentage difference
 * @param {number|null} baselineValue - Baseline (router5) value for ratio calculation
 * @param {number|null} currentValue - Current (real-router) value for ratio calculation
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
      // real-router is 2x+ better
      return `${color}${sign}${diff.toFixed(2)}% (${ratio.toFixed(1)}x ${betterLabel})${RESET}`;
    } else if (ratio <= 0.5) {
      // real-router is 2x+ worse
      return `${color}${sign}${diff.toFixed(2)}% (${(1 / ratio).toFixed(1)}x ${worseLabel})${RESET}`;
    }
  }

  return `${color}${sign}${diff.toFixed(2)}%${RESET}`;
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
 * Compare two benchmark results
 */
function compareBenchmarks(baselineFile, currentFile) {
  console.log(`${BOLD}${BLUE}=== Benchmark Comparison ===${RESET}\n`);
  console.log(`${GRAY}router5 (baseline): ${baselineFile}${RESET}`);
  console.log(`${GRAY}real-router (current): ${currentFile}${RESET}\n`);

  const baselineResults = parseBenchmarkFile(join(RESULTS_DIR, baselineFile));
  const currentResults = parseBenchmarkFile(join(RESULTS_DIR, currentFile));

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
 * Get latest benchmark pair
 */
function getLatestBenchmarkPair() {
  const files = readdirSync(RESULTS_DIR);

  // Group files by timestamp
  const pairs = new Map();

  for (const file of files) {
    if (!file.endsWith(".txt")) continue;

    // Match new (router5/real-router) naming
    const match = file.match(/^(\d{8}_\d{6})_(router5|real-router)\.txt$/);
    if (!match) continue;

    const [, timestamp, version] = match;

    if (!pairs.has(timestamp)) {
      pairs.set(timestamp, {});
    }

    pairs.get(timestamp)[version] = file;
  }

  // Find latest complete pair
  const timestamps = Array.from(pairs.keys()).sort().reverse();

  for (const timestamp of timestamps) {
    const pair = pairs.get(timestamp);
    if (pair["router5"] && pair["real-router"]) {
      return {
        baseline: pair["router5"],
        current: pair["real-router"],
      };
    }
  }

  return null;
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
  // Use latest pair
  const pair = getLatestBenchmarkPair();

  if (!pair) {
    console.error(
      `${RED}Error: No complete benchmark pairs found in ${RESULTS_DIR}${RESET}`,
    );
    process.exit(1);
  }

  compareBenchmarks(pair.baseline, pair.current);
} else if (args.length === 2) {
  // Use specified files
  compareBenchmarks(args[0], args[1]);
} else {
  console.error(
    `${RED}Usage: ${process.argv[1]} [baseline_file current_file]${RESET}`,
  );
  console.error(
    `${GRAY}If no files specified, uses the latest benchmark pair${RESET}`,
  );
  process.exit(1);
}
