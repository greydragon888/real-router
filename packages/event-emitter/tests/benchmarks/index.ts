/* eslint-disable unicorn/prefer-event-target */
/**
 * EventEmitter Benchmarks Entry Point
 *
 * Run: pnpm bench
 * Results: .bench/mitata-results.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { run } from "mitata";

import { EventEmitter } from "../../src/EventEmitter";

// Import benchmark file (registers benchmarks via bench())
import "./event-emitter.bench";

// ============================================================================
// JIT Warmup
// ============================================================================

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type WarmupMap = {
  a: [];
  b: [x: string, y: string];
  c: [x: string, y: string, z: object];
};

function warmupJIT(): void {
  console.error("JIT warmup: 100 iterations...");

  for (let i = 0; i < 100; i++) {
    const emitter = new EventEmitter<WarmupMap>({
      limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: 5 },
      onListenerError: () => {},
      onListenerWarn: () => {},
    });

    const noop = () => {};
    const noop2 = (_x: string, _y: string) => {};
    const noop3 = (_x: string, _y: string, _z: object) => {};

    const u1 = emitter.on("a", noop);
    const u2 = emitter.on("b", noop2);
    const u3 = emitter.on("c", noop3);

    emitter.emit("a");
    emitter.emit("b", "x", "y");
    emitter.emit("c", "x", "y", { z: true });

    emitter.listenerCount("a");

    u1();
    u2();
    u3();
    emitter.emit("a");

    emitter.setLimits({
      maxListeners: 100,
      warnListeners: 50,
      maxEventDepth: 10,
    });

    emitter.on("a", () => {});
    emitter.clearAll();
  }

  const noDepthEmitter = new EventEmitter<WarmupMap>();

  noDepthEmitter.on("c", (_x: string, _y: string, _z: object) => {});

  for (let i = 0; i < 100; i++) {
    noDepthEmitter.emit("c", "x", "y", { z: true });
  }

  console.error("JIT warmup complete");
}

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
  p50: number;
  p99: number;
  rme: number;
  heap: HeapStats;
}

interface BenchmarkResult {
  name: string;
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

warmupJIT();

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
            stats: {
              avg: s.avg,
              min: s.min,
              max: s.max,
              p50: s.p50,
              p99: s.p99,
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
