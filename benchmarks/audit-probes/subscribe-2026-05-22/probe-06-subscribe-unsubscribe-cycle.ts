/**
 * Probe 06: subscribe/unsubscribe registration churn cost.
 *
 * Verifies (or refutes) audit Bug #15 — claim that `EventBusNamespace.subscribe`
 * allocates a fresh closure-wrapper per registration:
 *
 *   subscribe(listener) {
 *     return this.#emitter.on(
 *       events.TRANSITION_SUCCESS,
 *       (toState, fromState) => listener({ route: toState, previousRoute: fromState }),
 *     );
 *   }
 *
 * Models: React adapter component that (incorrectly) subscribes inside the
 * render function — 1000 subscribe + 1000 unsubscribe per microtask burst.
 *
 * Two variants:
 *   A. 1 subscribe + 1 unsubscribe per iteration (steady-state churn)
 *   B. measure batch: 1000 subscribes followed by 1000 unsubscribes
 *
 * Fresh router per variant.
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
];

async function main() {
  console.log("=== probe-06: subscribe/unsubscribe registration churn cost ===\n");

  // A. steady-state 1+1 per iteration
  let resA: Stats;
  {
    const router = createRouter(routes);
    await router.start("/");
    const listener = () => {};

    resA = await bench("A. subscribe(listener) → unsubscribe()", () => {
      const unsub = router.subscribe(listener);
      unsub();
    });
  }

  // B. batch 1000 subscribes
  let resB: Stats;
  {
    const router = createRouter(routes);
    await router.start("/");
    const listener = () => {};
    const unsubs: Array<() => void> = new Array(1000);

    resB = await bench("B. 1000x subscribe(listener) (no unsub)", () => {
      for (let k = 0; k < 1000; k++) {
        unsubs[k] = router.subscribe(listener);
      }
      // teardown for next iteration to avoid unbounded growth
      for (let k = 0; k < 1000; k++) unsubs[k]();
    });
  }

  console.log("\n--- Verdict ---");
  console.log(`  Per cycle (A): ${resA.avg.toFixed(1)} ns — one closure-wrapper alloc + Set.add + Set.delete`);
  console.log(`  Per 2000 ops (B, 1000 sub + 1000 unsub): ${resB.avg.toFixed(1)} ns`);
  console.log(`  Implied per single subscribe call (B / 2000): ${(resB.avg / 2000).toFixed(1)} ns`);
  console.log("");
  console.log("  Bug #15 verdict:");
  console.log("    If per-subscribe cost > ~200 ns, the closure-wrapper allocation is measurable.");
  console.log("    Multi-registration overhead (1000 subscribe(cb) duplicates) — see Bug #3.");
  if (Math.max(resA.rme, resB.rme) > 5) console.log("  [NOISE] RME > 5% in at least one variant — re-run recommended");
}

main().catch(console.error);
