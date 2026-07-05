/**
 * Probe 22: cloneRouter() cost as a function of dependency-map size.
 *
 * Tests audit Bug #1 (deps shallow merge) at the **perf** level:
 * `mergedDeps = { ...sourceDeps, ...dependencies }` in cloneRouter.ts:39-42.
 * Theoretical cost is O(N) in number of deps keys.
 *
 * Three variants on a 10-route base:
 *   A. base only, no deps   (Δ closes #21 cross-cut — 10 routes vs 50 routes)
 *   B. small deps           (5 keys, primitive values)
 *   C. large deps           (200 keys, primitive values)
 *
 * Compared against probe-21 to gauge whether deps spread dominates 50-route
 * base cost. Confirms Bug #1 perf cost claim.
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

function makeRoutes(n: number) {
  const routes = [];
  for (let i = 0; i < n; i++) {
    routes.push({ name: `route${i}`, path: `/route${i}/:id` });
  }
  return routes;
}

function makeDeps(n: number): Record<string, number> {
  const deps: Record<string, number> = {};
  for (let i = 0; i < n; i++) deps[`key${i}`] = i;
  return deps;
}

async function main() {
  console.log("=== probe-22: cloneRouter() cost vs deps size (10-route base) ===\n");

  const routes = makeRoutes(10);

  // A. no deps
  let resA: Stats;
  {
    const base = createRouter(routes);
    await base.start("/route0/abc");
    resA = await bench("A. clone(base) — 0 deps", () => {
      cloneRouter(base);
    });
  }

  // B. small deps (5 keys)
  let resB: Stats;
  {
    const base = createRouter(routes, undefined, makeDeps(5));
    await base.start("/route0/abc");
    resB = await bench("B. clone(base) — 5 deps (small)", () => {
      cloneRouter(base);
    });
  }

  // C. large deps (200 keys)
  let resC: Stats;
  {
    const base = createRouter(routes, undefined, makeDeps(200));
    await base.start("/route0/abc");
    resC = await bench("C. clone(base) — 200 deps (large)", () => {
      cloneRouter(base);
    });
  }

  console.log("\n--- Verdict ---");
  const deltaAB = resB.avg - resA.avg;
  const deltaAC = resC.avg - resA.avg;
  const noiseAB = 2 * Math.max(resA.stddev, resB.stddev);
  const noiseAC = 2 * Math.max(resA.stddev, resC.stddev);

  console.log(`  Δ small (B - A): ${deltaAB.toFixed(1)} ns  (noise floor ${noiseAB.toFixed(1)} ns)`);
  if (Math.abs(deltaAB) < noiseAB) console.log("    → [НЕ ПОДТВЕРЖДЕНО] — 5 deps overhead below noise");
  else console.log(`    → confirmed — ${(deltaAB / 5).toFixed(1)} ns per dep key (small)`);

  console.log(`  Δ large (C - A): ${deltaAC.toFixed(1)} ns  (noise floor ${noiseAC.toFixed(1)} ns)`);
  if (Math.abs(deltaAC) < noiseAC) console.log("    → [НЕ ПОДТВЕРЖДЕНО] — 200 deps overhead below noise");
  else console.log(`    → confirmed — ${(deltaAC / 200).toFixed(1)} ns per dep key (large)`);

  console.log("");
  console.log("  Bug #1 (deps shallow merge) perf interpretation:");
  console.log("    Spread cost is O(N) — confirmed if Δ scales linearly with key count.");
  if (resC.rme > 5 || resA.rme > 5 || resB.rme > 5) console.log("  [NOISE] RME > 5% in at least one variant");
}

main().catch(console.error);
