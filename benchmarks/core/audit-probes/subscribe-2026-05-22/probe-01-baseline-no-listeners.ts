/**
 * Probe 01: baseline navigate cost with 0 TRANSITION_SUCCESS subscribers.
 *
 * Establishes the floor against which probes 02-04 (N=1/10/100 subscribers)
 * are compared. Captures the cost of `emitTransitionSuccess` + the fast-path
 * inside EventEmitter when `#callbacks.get(event)` is `undefined` (no Set).
 *
 * Fresh router per variant (IC megamorphism workaround).
 * 500 warmup iterations, mitata measure() with batch_samples = 5*1024.
 */

import { measure, do_not_optimize } from "mitata";

import { createRouter } from "@real-router/core";

import type { Route } from "@real-router/core";

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
  const fmt = (ns: number) => ns >= 1e3 ? `${(ns / 1e3).toFixed(2)} µs` : `${ns.toFixed(1)} ns`;
  console.log(`  ${name.padEnd(60)} avg=${fmt(stats.avg)}  p50=${fmt(stats.p50)}  p99=${fmt(p99)}  σ=${fmt(stddev)}  rme=${rme.toFixed(2)}%`);
  return { avg: stats.avg, p50: stats.p50, p99, stddev, rme };
}

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

async function main() {
  console.log("=== probe-01: baseline navigate, 0 subscribers ===\n");

  const router = createRouter(routes);
  await router.start("/");
  const names = ["home", "about"];
  let i = 0;
  const res = await bench("A. navigate, 0 subscribe listeners", () => {
    void router.navigate(names[i++ & 1]);
  });

  console.log("\n--- Verdict ---");
  console.log(`  Baseline navigate cost (no subscribers): ${res.avg.toFixed(1)} ns`);
  if (res.rme > 5) console.log("  [NOISE] RME > 5% — re-run recommended");
  else console.log(`  RME ${res.rme.toFixed(2)}% — stable`);
}

main().catch(console.error);
