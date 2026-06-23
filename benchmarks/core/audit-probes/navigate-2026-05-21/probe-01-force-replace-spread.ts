/**
 * Probe 01: forceReplaceFromUnknown spread cost.
 *
 * Hypothesis (audit #6/#10b row 4): spread `{ ...opts, replace: true }` on every
 * navigate FROM UNKNOWN_ROUTE adds measurable allocation cost vs. plain navigate.
 *
 * Three measurements:
 *   A. Baseline navigate (ping-pong home <-> about, no UNKNOWN involvement)
 *   B. navigateToNotFound standalone (cost of state reset alone)
 *   C. navigateToNotFound + navigate (resets state to UNKNOWN, then navigate triggers spread)
 *
 * Interpretation: if C ≈ A + B (within 2σ), spread cost is negligible.
 * If C > A + B by ≥ 2σ → spread cost = C - A - B.
 */

import { measure, do_not_optimize } from "mitata";

import { createRouter } from "@real-router/core";

import type { Route } from "@real-router/core";

interface Stats { avg: number; p50: number; p99: number; stddev: number; rme: number }

function computeStats(samples: number[], avg: number): { stddev: number; rme: number } {
  const n = samples.length;
  const variance = samples.reduce((s, x) => s + (x - avg) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const sem = stddev / Math.sqrt(n);
  const rme = (1.96 * sem / avg) * 100;
  return { stddev, rme };
}

async function bench(name: string, fn: () => void): Promise<Stats> {
  for (let i = 0; i < 500; i++) fn();

  const stats = await measure(
    function* () { yield { bench() { do_not_optimize(fn()); } }; },
    { batch_samples: 5 * 1024, min_cpu_time: 500 * 1e6 },
  );
  const { stddev, rme } = computeStats(stats.samples as number[], stats.avg);
  const fmt = (ns: number) => ns >= 1e3 ? `${(ns / 1e3).toFixed(2)} µs` : `${ns.toFixed(1)} ns`;
  console.log(`  ${name.padEnd(60)} avg=${fmt(stats.avg)}  p50=${fmt(stats.p50)}  σ=${fmt(stddev)}  rme=${rme.toFixed(2)}%`);
  return { avg: stats.avg, p50: stats.p50, p99: stats.p99, stddev, rme };
}

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

async function main() {
  console.log("=== probe-01: forceReplaceFromUnknown spread cost ===\n");

  // A. Baseline navigate (fresh router)
  let resA: Stats;
  {
    const router = createRouter(routes);
    await router.start("/");
    const names = ["home", "about"];
    let i = 0;
    resA = await bench("A. navigate ping-pong (no UNKNOWN_ROUTE)", () => {
      void router.navigate(names[i++ & 1]);
    });
  }

  // B. navigateToNotFound standalone (fresh router)
  let resB: Stats;
  {
    const router = createRouter(routes);
    await router.start("/");
    resB = await bench("B. navigateToNotFound only", () => {
      router.navigateToNotFound("/x");
    });
  }

  // C. navigateToNotFound + navigate (fresh router; both ops per measurement)
  let resC: Stats;
  {
    const router = createRouter(routes);
    await router.start("/");
    resC = await bench("C. navigateToNotFound + navigate (UNKNOWN→home, spread)", () => {
      router.navigateToNotFound("/x");
      void router.navigate("home");
    });
  }

  console.log("\n--- Verdict ---");
  const delta = resC.avg - resA.avg - resB.avg;
  const noiseFloor = 2 * Math.max(resA.stddev, resB.stddev, resC.stddev);
  console.log(`  C - A - B = ${delta.toFixed(1)} ns (upper bound for forceReplaceFromUnknown spread cost)`);
  console.log(`  Noise floor (2 × max σ): ${noiseFloor.toFixed(1)} ns`);
  if (Math.abs(delta) < noiseFloor) {
    console.log("  → [НЕ ПОДТВЕРЖДЕНО]: spread overhead < noise floor");
  } else {
    console.log(`  → spread overhead ≈ ${delta.toFixed(1)} ns (above noise floor)`);
  }
}

main().catch(console.error);
