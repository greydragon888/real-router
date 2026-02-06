// packages/router-benchmarks/modules/index.ts

/**
 * Real Router Benchmarks Entry Point
 *
 * Run: pnpm bench
 * Run specific sections: BENCH_SECTIONS=1,2,3 pnpm bench
 * Results: .bench/{section-name}.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { run } from "mitata";

// MUST be first import to suppress console before router warnings
import "./helpers/suppress-console";

import { createSimpleRouter } from "./helpers";

// ============================================================================
// JIT Warmup: Pre-warm V8 for stable benchmark measurements
// ============================================================================

/**
 * Number of warmup iterations for JIT compilation.
 * V8 needs 200-300 iterations to fully optimize hot code paths.
 */
const JIT_WARMUP_ITERATIONS = 300;

// Warmup helper functions (defined outside to satisfy eslint consistent-function-scoping)
function warmupMiddlewareHandler(
  _to: unknown,
  _from: unknown,
  done: () => void,
): void {
  done();
}
const warmupMiddleware = () => warmupMiddlewareHandler;

function warmupGuardHandler(): boolean {
  return true;
}
const warmupGuard = () => warmupGuardHandler;

// Warmup callback for start() variants
function warmupStartCallback(): void {
  // Empty callback for start(callback) warmup
}

/**
 * Global JIT warmup that exercises all major router code paths.
 * This ensures V8 has optimized the code before benchmarks run,
 * preventing cold-start penalties from affecting measurements.
 */
function warmupJIT(): void {
  console.error(`JIT warmup: ${JIT_WARMUP_ITERATIONS} iterations...`);

  for (let i = 0; i < JIT_WARMUP_ITERATIONS; i++) {
    // Create fresh router instances to warm up object creation paths
    const router = createSimpleRouter();

    // Warm up plugin/middleware registration
    router.usePlugin(() => ({
      onStart: () => {},
      onStop: () => {},
      onTransitionSuccess: () => {},
    }));
    router.useMiddleware(warmupMiddleware);
    router.canActivate("home", warmupGuard);

    // Pre-create states for start(state) warmup
    const warmupState = router.makeState("about", {}, "/about");

    // Warm up ALL start() variants (critical for sections 10-11)
    // Variant 1: start() without args
    router.start();
    router.stop();

    // Variant 2: start(path)
    router.start("/about");
    router.stop();

    // Variant 3: start(state)
    router.start(warmupState);
    router.stop();

    // Variant 4: start(callback)
    router.start(warmupStartCallback);
    router.stop();

    // Variant 5: start(path, callback)
    router.start("/", warmupStartCallback);
    router.stop();

    // Now do navigation warmup
    router.start();

    // Warm up navigation paths
    router.navigate("about");
    router.navigate("home");

    // Warm up state operations
    router.getState();

    // Warm up event system
    const unsub = router.subscribe(() => {});

    router.addEventListener("$$success", () => {});
    router.addEventListener("$$error", () => {});

    unsub();

    router.stop();
  }

  console.error("JIT warmup complete");
}

// Section imports mapping
const SECTION_IMPORTS: Record<number, string[]> = {
  1: [
    "./01-navigation-basic/1.1-success.bench",
    "./01-navigation-basic/1.2-edge-cases.bench",
  ],
  2: [
    "./02-navigation-plugins/2.1-sync-extensions.bench",
    "./02-navigation-plugins/2.2-async-extensions.bench",
    "./02-navigation-plugins/2.3-edge-cases.bench",
  ],
  3: [
    "./03-dependencies/3.1-initialization.bench",
    "./03-dependencies/3.2-adding.bench",
    "./03-dependencies/3.3-getting.bench",
    "./03-dependencies/3.4-edge-cases.bench",
    "./03-dependencies/3.5-router-comparison.bench.ts",
  ],
  4: [
    "./04-plugins-management/4.1-adding.bench",
    "./04-plugins-management/4.2-edge-cases.bench",
  ],
  5: [
    "./05-router-options/5.1-initialization.bench",
    "./05-router-options/5.2-modification.bench",
    "./05-router-options/5.3-edge-cases.bench",
  ],
  7: [
    "./07-path-operations/7.1-buildPath.bench",
    "./07-path-operations/7.2-matchPath.bench",
    "./07-path-operations/7.3-setRootPath.bench",
    "./07-path-operations/7.4-edge-cases.bench",
  ],
  8: [
    "./08-current-state/8.2-comparing.bench",
    "./08-current-state/8.3-creating.bench",
    "./08-current-state/8.5-building.bench",
    "./08-current-state/8.6-forward.bench",
    "./08-current-state/8.7-edge-cases.bench",
  ],
  9: [
    "./09-redirects/9.1-middleware.bench",
    "./09-redirects/9.2-guards.bench",
    "./09-redirects/9.3-forwardTo.bench",
    "./09-redirects/9.5-edge-cases.bench",
  ],
  11: [
    "./11-events/11.1-addEventListener.bench",
    "./11-events/11.2-subscribe.bench",
    "./11-events/11.3-invokeEventListeners.bench",
    "./11-events/11.4-edge-cases.bench",
  ],
  12: [
    "./12-stress-testing/12.1-high-load-sequential.bench",
    "./12-stress-testing/12.2-route-scaling.bench",
    "./12-stress-testing/12.3-extension-scaling.bench",
    "./12-stress-testing/12.4-auto-cleanup.bench",
    "./12-stress-testing/12.5-comparative.bench",
  ],
  13: [
    "./13-cloning/13.1-ssr-scenarios.bench",
    "./13-cloning/13.2-testing-scenarios.bench",
    "./13-cloning/13.3-clone-scaling.bench",
    "./13-cloning/13.4-configuration.bench",
    "./13-cloning/13.5-isolation.bench",
    "./13-cloning/13.6-edge-cases.bench",
  ],
  14: ["./14-rx/14.1-state$.bench"],
};

// Parse BENCH_SECTIONS environment variable
function getRequestedSections(): number[] {
  const sectionsEnv = process.env.BENCH_SECTIONS;

  if (!sectionsEnv) {
    // Return all sections if not specified
    return Object.keys(SECTION_IMPORTS).map(Number);
  }

  return sectionsEnv
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

// Dynamic import of benchmark sections
async function importSections(): Promise<void> {
  const requestedSections = getRequestedSections();
  const availableSections = Object.keys(SECTION_IMPORTS).map(Number);

  // Warn about invalid sections
  for (const section of requestedSections) {
    if (!availableSections.includes(section)) {
      console.error(
        `Warning: Section ${section} not found. Available: ${availableSections.join(", ")}`,
      );
    }
  }

  // Filter to valid sections only
  const validSections = requestedSections.filter((s) =>
    availableSections.includes(s),
  );

  // Import requested sections
  for (const section of validSections) {
    const imports = SECTION_IMPORTS[section];

    for (const importPath of imports) {
      await import(importPath);
    }
  }

  console.error(`Running sections: ${validSections.join(", ") || "none"}`);
}

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
  11: "11-events",
  12: "12-stress-testing",
  13: "13-cloning",
  14: "14-rx",
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

// Main: import sections, warmup JIT, then run benchmarks
void importSections()
  .then(() => {
    warmupJIT();

    return run();
  })
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
