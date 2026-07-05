/**
 * Probe 02: sync vs async guard path cost.
 *
 * Hypothesis (audit 10d#2, #12): async-guard branch allocates extra (AbortController,
 * `isCurrentNav` closure, `emitLeaveApproveCallback` closure) + microtask hop, adding
 * meaningful overhead vs pure sync path.
 *
 * Three measurements (fresh router per variant to avoid IC megamorphism):
 *   A. No guards (baseline sync hot path)
 *   B. 1 sync guard returning true (still sync path — no Promise)
 *   C. 1 async guard returning Promise.resolve(true) (async branch — AbortController + closures)
 *
 * Interpretation:
 *   - Δ(B-A) = cost of running the guard pipeline at all (still sync)
 *   - Δ(C-B) = cost of async branch (closures + AbortController + microtask)
 */

import { measure, do_not_optimize } from "mitata";

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { Route } from "@real-router/core";

interface Stats { avg: number; p50: number; stddev: number; rme: number }

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
  return { avg: stats.avg, p50: stats.p50, stddev, rme };
}

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

async function main() {
  console.log("=== probe-02: sync vs async guard branch cost ===\n");

  // A. No guards
  let resA: Stats;
  {
    const router = createRouter(routes);
    await router.start("/");
    const names = ["home", "about"];
    let i = 0;
    resA = await bench("A. navigate, no guards (sync hot path)", () => {
      void router.navigate(names[i++ & 1]);
    });
  }

  // B. 1 sync guard returning true
  let resB: Stats;
  {
    const router = createRouter(routes);
    const lifecycle = getLifecycleApi(router);
    lifecycle.addActivateGuard("home", () => () => true);
    lifecycle.addActivateGuard("about", () => () => true);
    await router.start("/");
    const names = ["home", "about"];
    let i = 0;
    resB = await bench("B. navigate, 1 sync guard (still sync path)", () => {
      void router.navigate(names[i++ & 1]);
    });
  }

  // C. 1 async guard returning Promise.resolve(true)
  let resC: Stats;
  {
    const router = createRouter(routes);
    const lifecycle = getLifecycleApi(router);
    lifecycle.addActivateGuard("home", () => () => Promise.resolve(true));
    lifecycle.addActivateGuard("about", () => () => Promise.resolve(true));
    await router.start("/");
    const names = ["home", "about"];
    let i = 0;
    resC = await bench("C. navigate, 1 async guard (async branch)", () => {
      void router.navigate(names[i++ & 1]);
    });
  }

  console.log("\n--- Verdict ---");
  const guardCost = resB.avg - resA.avg;
  const asyncBranchCost = resC.avg - resB.avg;
  const noiseAB = 2 * Math.max(resA.stddev, resB.stddev);
  const noiseBC = 2 * Math.max(resB.stddev, resC.stddev);

  console.log(`  Sync guard overhead (B-A): ${guardCost.toFixed(1)} ns  (noise floor ${noiseAB.toFixed(1)} ns)`);
  if (Math.abs(guardCost) < noiseAB) console.log("    → [НЕ ПОДТВЕРЖДЕНО]");
  console.log(`  Async branch overhead (C-B): ${asyncBranchCost.toFixed(1)} ns  (noise floor ${noiseBC.toFixed(1)} ns)`);
  if (Math.abs(asyncBranchCost) < noiseBC) console.log("    → [НЕ ПОДТВЕРЖДЕНО]");
}

main().catch(console.error);
