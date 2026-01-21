/**
 * Logger Benchmarks Entry Point
 *
 * Run: pnpm bench
 * Results: .bench/mitata-results.json
 *
 * Categories:
 * 1. Level Filtering - Log level filtering performance
 * 2. Callbacks - Callback execution and overhead
 * 3. Arguments - Argument handling and processing
 * 4. Configuration - Configuration changes and updates
 * 5. Real-World - Realistic core usage patterns
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { run } from "mitata";

// Import all benchmark files (they register benchmarks via boxplot/summary/bench)
import "./arguments.bench";
import "./callbacks.bench";
import "./configuration.bench";
import "./level-filtering.bench";
import "./real-world.bench";

// ============================================================================
// Run benchmarks and save results
// ============================================================================

// @ts-expect-error - import.meta.url is supported by tsx runtime
const OUTPUT_DIR = fileURLToPath(new URL("../../.bench", import.meta.url));
const OUTPUT_FILE = `${OUTPUT_DIR}/mitata-results.json`;

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

run()
  .then((results: any) => {
    try {
      const benchmarkResults: BenchmarkResult[] = results.benchmarks
        .filter((b: any) => b.runs?.[0]?.stats)
        .map((b: any) => {
          const s = b.runs[0].stats;
          const heap = s.heap ?? { avg: 0, min: 0, max: 0 };

          return {
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
                avg: heap.avg ?? 0,
                min: heap.min ?? 0,
                max: heap.max ?? 0,
              },
            },
          };
        });

      mkdirSync(OUTPUT_DIR, { recursive: true });
      writeFileSync(OUTPUT_FILE, JSON.stringify(benchmarkResults, null, 2));

      console.error(`\nResults saved to: ${OUTPUT_FILE}`);
    } catch (error) {
      console.error("Error processing results:", error);
    }
  })
  .catch((error) => {
    console.error("Run error:", error);
  });
