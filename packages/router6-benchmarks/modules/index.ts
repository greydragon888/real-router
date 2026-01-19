// packages/real-router-benchmarks/modules/index.ts

/**
 * Router6 Benchmarks Entry Point
 *
 * Run: pnpm bench
 * Results: .bench/{section-name}.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { run } from "mitata";

// MUST be first import to suppress console before router warnings
import "./helpers/suppress-console";

// Import benchmark suites
import "./01-navigation-basic/1.1-success.bench";
import "./01-navigation-basic/1.2-edge-cases.bench";

import "./02-navigation-plugins/2.1-sync-extensions.bench";
import "./02-navigation-plugins/2.2-async-extensions.bench";
import "./02-navigation-plugins/2.3-edge-cases.bench";

import "./03-dependencies/3.1-initialization.bench";
import "./03-dependencies/3.2-adding.bench";
import "./03-dependencies/3.3-getting.bench";
import "./03-dependencies/3.4-edge-cases.bench";
import "./03-dependencies/3.5-router-comparison.bench.ts";

import "./04-plugins-management/4.1-adding.bench";
import "./04-plugins-management/4.2-edge-cases.bench";

import "./05-router-options/5.1-initialization.bench";
import "./05-router-options/5.2-modification.bench";
import "./05-router-options/5.3-edge-cases.bench";

import "./07-path-operations/7.1-buildPath.bench";
import "./07-path-operations/7.2-matchPath.bench";
import "./07-path-operations/7.3-setRootPath.bench";
import "./07-path-operations/7.4-edge-cases.bench";

import "./08-current-state/8.2-comparing.bench";
import "./08-current-state/8.3-creating.bench";
import "./08-current-state/8.5-building.bench";
import "./08-current-state/8.6-forward.bench";
import "./08-current-state/8.7-edge-cases.bench";

import "./09-redirects/9.1-middleware.bench";
import "./09-redirects/9.2-guards.bench";
import "./09-redirects/9.3-forwardTo.bench";
import "./09-redirects/9.5-edge-cases.bench";

import "./10-start-stop/10.1-start-success.bench";
import "./10-start-stop/10.2-stop-success.bench";
import "./10-start-stop/10.4-lifecycle-edge-cases.bench";

import "./11-events/11.1-addEventListener.bench";
import "./11-events/11.2-subscribe.bench";
import "./11-events/11.3-invokeEventListeners.bench";
import "./11-events/11.4-edge-cases.bench";

import "./12-stress-testing/12.1-high-load-sequential.bench";
import "./12-stress-testing/12.2-route-scaling.bench";
import "./12-stress-testing/12.3-extension-scaling.bench";
import "./12-stress-testing/12.4-auto-cleanup.bench";
import "./12-stress-testing/12.5-comparative.bench";

import "./13-cloning/13.1-ssr-scenarios.bench";
import "./13-cloning/13.2-testing-scenarios.bench";
import "./13-cloning/13.3-clone-scaling.bench";
import "./13-cloning/13.4-configuration.bench";
import "./13-cloning/13.5-isolation.bench";
import "./13-cloning/13.6-edge-cases.bench";

// ============================================================================
// Run benchmarks and save results
// ============================================================================

// Determine router version from environment (router5 or real-router)
const routerVersion = process.env.BENCH_ROUTER ?? "real-router";

const OUTPUT_DIR = fileURLToPath(
  // @ts-expect-error - import.meta.url is supported by tsx runtime
  new URL(`../.bench/${routerVersion}`, import.meta.url),
);

// Section number to folder name mapping
const SECTION_NAMES: Record<number, string> = {
  1: "01-navigation-basic",
  2: "02-navigation-plugins",
  3: "03-dependencies",
  4: "04-plugins-management",
  5: "05-router-options",
  6: "06-route-nodes",
  7: "07-path-operations",
  8: "08-current-state",
  9: "09-redirects",
  10: "10-start-stop",
  11: "11-events",
  12: "12-stress-testing",
  13: "13-cloning",
};

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

interface BenchmarkStats {
  avg: number;
  p50: number;
  p99: number;
  max: number;
  rme: number;
  heap: {
    avg: number;
  };
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

function extractSectionNumber(benchmarkName: string): number | null {
  // Parse "1.2.3 Description" → 1
  const match = /^(\d+)\./.exec(benchmarkName);

  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

function processResults(results: MitataResults): void {
  // Group benchmarks by section
  const sectionResults = new Map<number, BenchmarkResult[]>();

  for (const b of results.benchmarks) {
    const firstRun = b.runs?.[0];
    const s = firstRun?.stats;

    if (!s) {
      continue;
    }

    const sectionNumber = extractSectionNumber(b.alias);

    if (sectionNumber === null) {
      console.error(`Warning: Cannot parse section from "${b.alias}"`);
      continue;
    }

    const heap = s.heap ?? { avg: 0, min: 0, max: 0 };

    const result: BenchmarkResult = {
      name: b.alias,
      group: b.group,
      stats: {
        avg: s.avg,
        p50: s.p50,
        p99: s.p99,
        max: s.max,
        rme: calculateRME(s.samples ?? [], s.avg),
        heap: {
          avg: heap.avg,
        },
      },
    };

    const existing = sectionResults.get(sectionNumber);

    if (existing) {
      existing.push(result);
    } else {
      sectionResults.set(sectionNumber, [result]);
    }
  }

  // Save each section to a separate file
  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const [sectionNumber, benchmarks] of sectionResults) {
    const sectionName =
      SECTION_NAMES[sectionNumber] ?? `unknown-${sectionNumber}`;
    const outputFile = `${OUTPUT_DIR}/${sectionName}.json`;

    writeFileSync(outputFile, JSON.stringify(benchmarks, null, 2));
    console.error(`Results saved to: ${outputFile}`);
  }
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
