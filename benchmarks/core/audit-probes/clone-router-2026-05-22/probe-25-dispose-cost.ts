/**
 * Probe 25: clone.dispose() per-call cost.
 *
 * For SSR pool churn estimation: every request → cloneRouter → process → dispose.
 * Dispose is more expensive than clone (FSM teardown, plugins teardown,
 * EventEmitter clearAll, routes/lifecycle/state/deps cleanup).
 *
 * Test design:
 *   - Build a clone, dispose, repeat. Mitata measures the (clone + dispose)
 *     cycle, then we subtract clone-cost (probe-21) to isolate dispose.
 *   - 50-route base for SSR realism.
 */

import { measure, do_not_optimize } from "mitata";

import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";

interface Stats { avg: number; p50: number; p99: number; stddev: number; rme: number }

function computeStats(samples: number[], avg: number): { stddev: number; rme: number; p99: number } {
  const n = samples.length;
  const variance = samples.reduce((s, x) => s + (x - avg) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const sem = stddev / Math.sqrt(n);
  const rme = (1.96 * sem / avg) * 100;
  const sorted = [...samples].sort((a, b) => a - b);
  const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];
  return { stddev, rme, p99 };
}

async function bench(name: string, fn: () => void): Promise<Stats> {
  for (let i = 0; i < 500; i++) fn();

  const stats = await measure(
    function* () { yield { bench() { do_not_optimize(fn()); } }; },
    { batch_samples: 5 * 1024, min_cpu_time: 500 * 1e6 },
  );
  const { stddev, rme, p99 } = computeStats(stats.samples as number[], stats.avg);
  const fmt = (ns: number) => ns >= 1e6 ? `${(ns / 1e6).toFixed(2)} ms` : ns >= 1e3 ? `${(ns / 1e3).toFixed(2)} µs` : `${ns.toFixed(1)} ns`;
  console.log(`  ${name.padEnd(60)} avg=${fmt(stats.avg)}  p50=${fmt(stats.p50)}  p99=${fmt(p99)}  σ=${fmt(stddev)}  rme=${rme.toFixed(2)}%`);
  return { avg: stats.avg, p50: stats.p50, p99, stddev, rme };
}

async function main() {
  console.log("=== probe-25: clone.dispose() per-call cost (50-route base) ===\n");

  const routes = [];
  for (let i = 0; i < 50; i++) {
    routes.push({ name: `route${i}`, path: `/route${i}/:id` });
  }
  const base = createRouter(routes);
  await base.start("/route0/abc");

  // A. cycle: clone + dispose
  const resCycle = await bench("A. cloneRouter(base) + clone.dispose() cycle", () => {
    const clone = cloneRouter(base);
    clone.dispose();
  });

  // B. clone-only (for subtraction)
  const resClone = await bench("B. cloneRouter(base) only (no dispose)", () => {
    cloneRouter(base);
  });

  console.log("\n--- Verdict ---");
  const disposeNs = resCycle.avg - resClone.avg;
  const noise = 2 * Math.max(resCycle.stddev, resClone.stddev);
  console.log(`  Implied dispose cost: ${(disposeNs / 1e3).toFixed(2)} µs  (noise floor ${(noise / 1e3).toFixed(2)} µs)`);
  if (Math.abs(disposeNs) < noise) {
    console.log("    → [НЕ ПОДТВЕРЖДЕНО] — dispose-cost statistically below noise");
  } else {
    console.log(`    → confirmed — dispose adds ${(disposeNs / 1e3).toFixed(2)} µs per cycle`);
  }
  console.log(`  Total per cycle (clone + dispose): ${(resCycle.avg / 1e3).toFixed(2)} µs`);
  console.log(`  SSR pool churn estimate @ 5000 RPS: ${((resCycle.avg * 5000) / 1e6).toFixed(2)} ms/s CPU on clone+dispose`);
  if (Math.max(resCycle.rme, resClone.rme) > 5) console.log("  [NOISE] RME > 5% in at least one variant — re-run recommended");
}

main().catch(console.error);
