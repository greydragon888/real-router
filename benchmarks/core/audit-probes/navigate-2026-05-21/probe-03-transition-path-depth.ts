/**
 * Probe 03: getTransitionPath cost vs tree depth.
 *
 * Hypothesis (audit 10d#4): getTransitionPath cost grows with the number of
 * segments in the (from, to) name pair. Deep cross-tree navigations should be
 * meaningfully more expensive than flat sibling navigations.
 *
 * Two measurements (fresh router per variant):
 *   A. Flat ping-pong: navigate home ↔ about (1 segment each, intersection empty)
 *   B. Deep ping-pong: navigate a.a1.a2.a3.a4 ↔ b.b1.b2.b3.b4 (5 segments each)
 *
 * Note: deep ping-pong stresses nameToIDs (5 IDs each), getTransitionPath
 * (intersection scan), and segment-array allocations for activate/deactivate lists.
 */

import { measure, do_not_optimize } from "mitata";

import { createRouter } from "@real-router/core";

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

const flatRoutes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

// Two parallel chains 5 levels deep
const deepRoutes: Route[] = [
  {
    name: "a",
    path: "/a",
    children: [{
      name: "a1",
      path: "/a1",
      children: [{
        name: "a2",
        path: "/a2",
        children: [{
          name: "a3",
          path: "/a3",
          children: [{ name: "a4", path: "/a4" }],
        }],
      }],
    }],
  },
  {
    name: "b",
    path: "/b",
    children: [{
      name: "b1",
      path: "/b1",
      children: [{
        name: "b2",
        path: "/b2",
        children: [{
          name: "b3",
          path: "/b3",
          children: [{ name: "b4", path: "/b4" }],
        }],
      }],
    }],
  },
];

async function main() {
  console.log("=== probe-03: getTransitionPath cost vs depth ===\n");

  // A. Flat (1 segment per route)
  let resA: Stats;
  {
    const router = createRouter(flatRoutes);
    await router.start("/");
    const names = ["home", "about"];
    let i = 0;
    resA = await bench("A. flat ping-pong (1 segment each)", () => {
      void router.navigate(names[i++ & 1]);
    });
  }

  // B. Deep (5 segments per route, no intersection between siblings)
  let resB: Stats;
  {
    const router = createRouter(deepRoutes);
    await router.start("/a/a1/a2/a3/a4");
    const names = ["a.a1.a2.a3.a4", "b.b1.b2.b3.b4"];
    let i = 0;
    resB = await bench("B. deep ping-pong (5 segments each)", () => {
      void router.navigate(names[i++ & 1]);
    });
  }

  console.log("\n--- Verdict ---");
  const delta = resB.avg - resA.avg;
  const noiseFloor = 2 * Math.max(resA.stddev, resB.stddev);
  console.log(`  Depth overhead (B-A): ${delta.toFixed(1)} ns  (noise floor ${noiseFloor.toFixed(1)} ns)`);
  if (Math.abs(delta) < noiseFloor) {
    console.log("    → [НЕ ПОДТВЕРЖДЕНО]");
  } else {
    console.log(`    → 5-segment navigate is ${(resB.avg / resA.avg).toFixed(2)}× slower than 1-segment`);
  }
}

main().catch(console.error);
