/**
 * Router6 Benchmarks Entry Point
 *
 * Run: pnpm bench
 * Results: .bench/mitata-results.json
 *
 * Categories:
 * 1. navigation - Route navigation performance
 * 2. transition/mergeStates - State merging performance
 * 3. (commented) transitionPath - Transition path calculation
 * 4. (commented) routes - Route operations
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { run } from "mitata";

// Import all benchmark files (they register benchmarks via summary/bench)
import "./navigation/basic.bench";
import "./navigation/options.bench";
import "./navigation/guards.bench";
import "./transition/mergeStates.bench";
import "./helpers/freezeStateInPlace.bench";
import "./validation/isNavigationOptions.bench";
// import "./transitionPath/getTransitionPath.bench";
// import "./transitionPath/nameToIDs.bench";
// import "./routes/routeQuery/isActiveRoute.bench";
// import "./routes/routeQuery/shouldUpdateNode.bench";
// import "./routes/routePath/buildPath.bench";
// import "./routes/routePath/matchPath.bench";
// import "./observable/invokeEventListeners.bench.ts";

// ============================================================================
// Run benchmarks and save results
// ============================================================================

// @ts-expect-error - import.meta.url is supported by tsx runtime
const OUTPUT_DIR = fileURLToPath(new URL("../../.bench", import.meta.url));
const OUTPUT_FILE = `${OUTPUT_DIR}/mitata-results.json`;

// Mitata result types (not exported by the library)
interface MitataHeap {
  avg: number;
  min: number;
  max: number;
}

interface MitataStats {
  avg: number;
  min: number;
  max: number;
  p25: number;
  p50: number;
  p75: number;
  p99: number;
  p999: number;
  samples?: number[];
  heap?: MitataHeap;
}

interface MitataRun {
  stats?: MitataStats;
}

interface MitataBenchmark {
  alias: string;
  group: number;
  runs?: MitataRun[];
}

interface MitataResults {
  benchmarks: MitataBenchmark[];
}

interface HeapStats {
  avg: number;
  min: number;
  max: number;
}

interface BenchmarkStats {
  avg: number;
  min: number;
  max: number;
  p25: number;
  p50: number;
  p75: number;
  p99: number;
  p999: number;
  rme: number;
  heap: HeapStats;
}

interface BenchmarkResult {
  name: string;
  group: number;
  stats: BenchmarkStats;
}

function calculateRME(samples: number[], avg: number): number {
  if (samples.length < 2) {
    return 0;
  }

  const variance =
    samples.reduce((sum, x) => sum + (x - avg) ** 2, 0) / (samples.length - 1);
  const stdDev = Math.sqrt(variance);
  const stdError = stdDev / Math.sqrt(samples.length);

  return (stdError / avg) * 100;
}

function processResults(results: MitataResults): void {
  const benchmarkResults: BenchmarkResult[] = [];

  for (const b of results.benchmarks) {
    const firstRun = b.runs?.[0];
    const s = firstRun?.stats;

    if (!s) {
      continue;
    }

    const heap = s.heap ?? { avg: 0, min: 0, max: 0 };

    benchmarkResults.push({
      name: b.alias,
      group: b.group,
      stats: {
        avg: s.avg,
        min: s.min,
        max: s.max,
        p25: s.p25,
        p50: s.p50,
        p75: s.p75,
        p99: s.p99,
        p999: s.p999,
        rme: calculateRME(s.samples ?? [], s.avg),
        heap: {
          avg: heap.avg,
          min: heap.min,
          max: heap.max,
        },
      },
    });
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(benchmarkResults, null, 2));

  console.error(`\nResults saved to: ${OUTPUT_FILE}`);
}

void run()
  .then((results: unknown) => {
    try {
      processResults(results as MitataResults);
    } catch (error: unknown) {
      console.error("Error processing results:", error);
    }

    return null;
  })
  .catch((error: unknown) => {
    console.error("Run error:", error);
  });
