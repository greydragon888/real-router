/**
 * Probe 23: cloneRouter(base) vs createRouter(routes) initial — overhead comparison.
 *
 * Verifies the audit claim "route tree rebuilt from definitions" — if true,
 * cloneRouter has roughly the same fixed cost as createRouter plus extra work
 * (extract definitions via `routeTreeToDefinitions`, snapshot options/deps/factories,
 * re-apply config sub-fields, re-register guards, re-instantiate plugins).
 *
 * Two variants on 10-route fixture:
 *   A. createRouter(routes) — fresh construction (no start)
 *   B. cloneRouter(base) — clone of an already-started base router
 *
 * Δ B - A = cost of "everything cloneRouter does beyond createRouter".
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
  console.log("=== probe-23: cloneRouter(base) vs createRouter(routes) — overhead ===\n");

  const routes = [];
  for (let i = 0; i < 10; i++) {
    routes.push({ name: `route${i}`, path: `/route${i}/:id` });
  }

  // A. createRouter (no start)
  const resA = await bench("A. createRouter(routes) — fresh construction", () => {
    createRouter(routes);
  });

  // B. cloneRouter
  let resB: Stats;
  {
    const base = createRouter(routes);
    await base.start("/route0/abc");
    resB = await bench("B. cloneRouter(base) — clone of started base", () => {
      cloneRouter(base);
    });
  }

  console.log("\n--- Verdict ---");
  const delta = resB.avg - resA.avg;
  const noise = 2 * Math.max(resA.stddev, resB.stddev);
  console.log(`  createRouter avg: ${(resA.avg / 1e3).toFixed(2)} µs`);
  console.log(`  cloneRouter avg:  ${(resB.avg / 1e3).toFixed(2)} µs`);
  console.log(`  Δ (clone - create): ${(delta / 1e3).toFixed(2)} µs  (noise floor ${(noise / 1e3).toFixed(2)} µs)`);
  const ratio = resB.avg / resA.avg;
  console.log(`  Ratio: clone is ${ratio.toFixed(2)}× createRouter`);
  if (Math.abs(delta) < noise) console.log("    → [НЕ ПОДТВЕРЖДЕНО] — clone overhead vs create below noise floor");
  else console.log("    → confirmed — clone adds measurable overhead over fresh createRouter");
  if (Math.max(resA.rme, resB.rme) > 5) console.log("  [NOISE] RME > 5% — re-run recommended");
}

main().catch(console.error);
