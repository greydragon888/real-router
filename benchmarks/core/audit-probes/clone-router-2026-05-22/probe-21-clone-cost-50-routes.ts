/**
 * Probe 21: latency — cloneRouter() per-call cost for a 50-route base.
 *
 * Per audit prompt: «verify clone cost target — для 50-route base ожидаем
 * < 100 µs per clone. Если выше — finding.»
 *
 * Fresh base router built once per script; bench measures repeated `cloneRouter(base)`.
 * Each clone is discarded between iterations to keep heap pressure stable
 * (clones are unrooted after `do_not_optimize`).
 *
 * Mitata measure() with batch_samples = 5*1024, min_cpu_time = 500 ms.
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
  console.log("=== probe-21: cloneRouter() per-call cost (50-route base, no deps) ===\n");

  const routes = [];
  for (let i = 0; i < 50; i++) {
    routes.push({ name: `route${i}`, path: `/route${i}/:id` });
  }
  const base = createRouter(routes);
  await base.start("/route0/abc");

  const res = await bench("A. cloneRouter(base) — 50 routes, no deps", () => {
    cloneRouter(base);
  });

  console.log("\n--- Verdict ---");
  console.log(`  Per clone: avg=${(res.avg / 1e3).toFixed(2)} µs  p50=${(res.p50 / 1e3).toFixed(2)} µs  p99=${(res.p99 / 1e3).toFixed(2)} µs`);
  console.log(`  Target: < 100 µs per clone (50-route base)`);
  const targetNs = 100 * 1e3;
  if (res.avg > targetNs) {
    console.log(`  → FINDING: exceeded target by ${((res.avg - targetNs) / 1e3).toFixed(2)} µs (${((res.avg / targetNs) * 100).toFixed(1)}% of target)`);
  } else {
    console.log(`  → OK: ${((res.avg / targetNs) * 100).toFixed(1)}% of 100 µs budget`);
  }
  if (res.rme > 5) console.log("  [NOISE] RME > 5% — re-run recommended");
  else console.log(`  RME ${res.rme.toFixed(2)}% — stable`);
}

main().catch(console.error);
