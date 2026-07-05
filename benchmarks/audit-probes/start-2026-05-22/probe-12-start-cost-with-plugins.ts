/**
 * Probe 12: start() cost with N=10 plugins — SSR-realistic cold-boot.
 *
 * Tests whether plugin onStart() loop dominates start() for SSR-boot:
 *   - 10 plugins, each with a no-op onStart()
 *   - Same 10-route fixture as probe-11
 *
 * Δ vs probe-11 (no plugins) = cost of plugin loop + 10 onStart invocations.
 *
 * Per audit prompt: "Если 10 plugins добавляет > 1 ms — это значимо для SSR-boot латенси".
 */

import { measure, do_not_optimize } from "mitata";

import { createRouter } from "@real-router/core";

import type { PluginFactory } from "@real-router/core";

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

const makePlugin = (id: number): PluginFactory => () => ({
  onStart() { void id; },
});

async function main() {
  console.log("=== probe-12: start() cost with N=10 plugins ===\n");

  const routes = [];
  for (let i = 0; i < 10; i++) {
    routes.push({ name: `route${i}`, path: `/route${i}/:id` });
  }
  const plugins: PluginFactory[] = [];
  for (let i = 0; i < 10; i++) plugins.push(makePlugin(i));

  // A. no plugins (for delta)
  const resA = await bench("A. createRouter + start, 0 plugins", async () => {
    const router = createRouter(routes);
    await router.start("/route0/abc");
    return router;
  });

  // B. 10 plugins
  const resB = await bench("B. createRouter + 10 plugins + start", async () => {
    const router = createRouter(routes);
    router.usePlugin(...plugins);
    await router.start("/route0/abc");
    return router;
  });

  console.log("\n--- Verdict ---");
  const delta = resB.avg - resA.avg;
  const noise = 2 * Math.max(resA.stddev, resB.stddev);
  console.log(`  Plugin loop overhead (B - A): ${(delta / 1e3).toFixed(2)} µs  (noise floor ${(noise / 1e3).toFixed(2)} µs)`);
  if (Math.abs(delta) < noise) {
    console.log("    → [НЕ ПОДТВЕРЖДЕНО] — 10-plugin overhead below noise");
  } else {
    console.log(`    → confirmed — ${(delta / 10).toFixed(0)} ns per plugin (avg)`);
  }
  console.log(`  Total with 10 plugins: ${(resB.avg / 1e3).toFixed(2)} µs`);

  const ONE_MS_NS = 1e6;
  if (delta > ONE_MS_NS) {
    console.log(`  → SIGNIFICANT FINDING: 10 plugins adds ${(delta / 1e6).toFixed(2)} ms to start (> 1 ms threshold)`);
  } else {
    console.log(`  → Within budget — 10 plugins adds ${(delta / 1e3).toFixed(2)} µs (< 1 ms)`);
  }
  if (Math.max(resA.rme, resB.rme) > 5) console.log("  [NOISE] RME > 5% in at least one variant");
}

main().catch(console.error);
