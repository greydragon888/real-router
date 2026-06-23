/**
 * Probe 11: start() cost with 0 plugins — cold-boot baseline.
 *
 * For SSR cold-boot latency estimation. Each iteration:
 *   1. Construct fresh router (10 routes, no plugins)
 *   2. start("/")
 *   3. router is discarded (do_not_optimize prevents elision)
 *
 * Mitata measures the (createRouter + start) pair. The create cost is
 * separately measured in clone-router probe-23 (~23 µs for 10 routes) and
 * can be subtracted to isolate start().
 *
 * Note: start() is `await`ed inside the bench fn — mitata measures async
 * roundtrips properly via its sync sample-loop. For sync start() (no async
 * interceptors), this returns Promise.resolve(state) — measurement is
 * dominated by sync work + microtask hop.
 */

import { measure, do_not_optimize } from "mitata";

import { createRouter } from "@real-router/core";

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

async function bench(name: string, fn: () => Promise<unknown>): Promise<Stats> {
  // warmup
  for (let i = 0; i < 500; i++) await fn();

  const stats = await measure(
    async function* () {
      yield { async bench() { do_not_optimize(await fn()); } };
    },
    { batch_samples: 5 * 1024, min_cpu_time: 500 * 1e6 },
  );
  const { stddev, rme, p99 } = computeStats(stats.samples as number[], stats.avg);
  const fmt = (ns: number) => ns >= 1e6 ? `${(ns / 1e6).toFixed(2)} ms` : ns >= 1e3 ? `${(ns / 1e3).toFixed(2)} µs` : `${ns.toFixed(1)} ns`;
  console.log(`  ${name.padEnd(60)} avg=${fmt(stats.avg)}  p50=${fmt(stats.p50)}  p99=${fmt(p99)}  σ=${fmt(stddev)}  rme=${rme.toFixed(2)}%`);
  return { avg: stats.avg, p50: stats.p50, p99, stddev, rme };
}

async function main() {
  console.log("=== probe-11: start() cost, 0 plugins (cold-boot baseline) ===\n");

  const routes = [];
  for (let i = 0; i < 10; i++) {
    routes.push({ name: `route${i}`, path: `/route${i}/:id` });
  }

  const res = await bench("A. createRouter + start('/route0/abc'), no plugins", async () => {
    const router = createRouter(routes);
    await router.start("/route0/abc");
    return router;
  });

  console.log("\n--- Verdict ---");
  console.log(`  Cold-boot (create + start): ${(res.avg / 1e3).toFixed(2)} µs`);
  if (res.rme > 5) console.log("  [NOISE] RME > 5% — re-run recommended");
  else console.log(`  RME ${res.rme.toFixed(2)}% — stable`);
}

main().catch(console.error);
