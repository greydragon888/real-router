/**
 * Probe-05: emit cost overview at the EventBus level.
 *
 *   A. navigate with N=0 listeners (any kind) — baseline emit overhead.
 *   B. forceState vs send paths — comparison via direct router navigate cycles
 *      (sendNavigate/sendComplete use forceState; sendCancel/sendFail use send).
 *
 * Cross-reference: subscribe-audit probe-01 reports 542 ns baseline.
 * This probe is intentionally simple — main use is verdict on overhead at
 * the namespace level, not adapter wrap.
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
  console.log(`  ${name.padEnd(70)} avg=${fmt(stats.avg)}  p50=${fmt(stats.p50)}  p99=${fmt(p99)}  σ=${fmt(stddev)}  rme=${rme.toFixed(2)}%`);
  return { avg: stats.avg, p50: stats.p50, p99, stddev, rme };
}

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

async function main() {
  console.log("=== probe-05: emit cost (N=0 listeners + forceState path) ===\n");

  // A. Bare navigate, no listeners
  {
    const router = createRouter(routes);
    await router.start("/");
    const names = ["home", "about"];
    let i = 0;
    await bench("A. navigate(), 0 listeners (sendNavigate forceState + emit)", () => {
      void router.navigate(names[i++ & 1]);
    });
  }

  // B. navigate with 1 subscribe + 1 plugin onTransitionSuccess
  {
    const router = createRouter(routes);
    await router.start("/");
    router.subscribe(() => {});
    router.usePlugin(() => ({ onTransitionSuccess() {} }));
    const names = ["home", "about"];
    let i = 0;
    await bench("B. navigate(), subscribe+plugin (2 listeners on $$success)", () => {
      void router.navigate(names[i++ & 1]);
    });
  }
}

main().catch(console.error);
