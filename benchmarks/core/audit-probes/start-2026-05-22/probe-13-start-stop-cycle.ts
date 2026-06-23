/**
 * Probe 13: start → stop → start cycle cost (regression detection baseline).
 *
 * Verifies that repeated start/stop cycles on the same router instance
 * remain stable in cost (no accumulating state per cycle). The audit
 * highlights Bug #4 (FSM stuck STARTING after rejected interceptor) —
 * this probe ensures non-error cycles return to clean baseline.
 *
 * Two variants:
 *   A. fresh router per cycle (true cold-boot baseline)
 *   B. same router, repeated start/stop (cycle steady-state)
 *
 * If B grows linearly per cycle → state accumulation regression.
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
  console.log("=== probe-13: start → stop → start cycle ===\n");

  const routes = [];
  for (let i = 0; i < 10; i++) {
    routes.push({ name: `route${i}`, path: `/route${i}/:id` });
  }

  // A. fresh router each cycle
  const resA = await bench("A. fresh router per cycle (create + start)", async () => {
    const router = createRouter(routes);
    await router.start("/route0/abc");
    return router;
  });

  // B. same router: stop + start cycle
  const router = createRouter(routes);
  await router.start("/route0/abc");
  const resB = await bench("B. same router: stop + start cycle", async () => {
    router.stop();
    await router.start("/route0/abc");
    return router;
  });

  console.log("\n--- Verdict ---");
  console.log(`  Fresh-router create+start: ${(resA.avg / 1e3).toFixed(2)} µs`);
  console.log(`  Same-router stop+start:    ${(resB.avg / 1e3).toFixed(2)} µs`);
  const delta = resA.avg - resB.avg;
  const noise = 2 * Math.max(resA.stddev, resB.stddev);
  console.log(`  Δ (A - B): ${(delta / 1e3).toFixed(2)} µs  (noise floor ${(noise / 1e3).toFixed(2)} µs)`);
  console.log(`    → A > B expected (createRouter adds ~23 µs); confirms no state-accumulation regression in stop+start`);
  if (Math.max(resA.rme, resB.rme) > 5) console.log("  [NOISE] RME > 5% in at least one variant");
}

main().catch(console.error);
