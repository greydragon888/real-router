/**
 * Probe 14: start() with hydrateRouter consumed scratchpad vs without.
 *
 * Audit Bug #4 / risk #1: «#596 hydration scratchpad — свежий механизм».
 * This probe measures the perf cost of the scratchpad lifecycle:
 *   - hydrationState assigned on RouterInternals before start()
 *   - cleared in finally
 *
 * Per audit prompt: "Если hydration scratchpad consumption добавляет > 100 µs —
 * это связано с Bug #4 (FSM bottleneck)".
 *
 * Two variants on the same 10-route fixture, no SSR loader plugins:
 *   A. plain createRouter + start("/route0/abc")
 *   B. createRouter + hydrateRouter(router, serializedJson)
 *
 * Δ B - A = scratchpad assign + serialize-parse cost + finally cleanup.
 */

import { measure, do_not_optimize } from "mitata";

import { createRouter } from "@real-router/core";
import { hydrateRouter, serializeRouterState } from "@real-router/core/utils";

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
  console.log("=== probe-14: start() with vs without hydration scratchpad ===\n");

  const routes = [];
  for (let i = 0; i < 10; i++) {
    routes.push({ name: `route${i}`, path: `/route${i}/:id` });
  }

  // Build a serialized SSR state (once)
  const tmpRouter = createRouter(routes);
  await tmpRouter.start("/route0/abc");
  const serialized = serializeRouterState(tmpRouter.getState()!);
  tmpRouter.stop();

  // A. plain start
  const resA = await bench("A. createRouter + start (no hydration)", async () => {
    const router = createRouter(routes);
    await router.start("/route0/abc");
    return router;
  });

  // B. hydrateRouter
  const resB = await bench("B. createRouter + hydrateRouter (with scratchpad)", async () => {
    const router = createRouter(routes);
    await hydrateRouter(router, serialized);
    return router;
  });

  console.log("\n--- Verdict ---");
  const delta = resB.avg - resA.avg;
  const noise = 2 * Math.max(resA.stddev, resB.stddev);
  console.log(`  Hydration overhead (B - A): ${(delta / 1e3).toFixed(2)} µs  (noise floor ${(noise / 1e3).toFixed(2)} µs)`);
  if (Math.abs(delta) < noise) {
    console.log("    → [НЕ ПОДТВЕРЖДЕНО] — hydration scratchpad overhead below noise");
  } else if (delta > 100_000) {
    console.log(`    → FINDING: hydration adds ${(delta / 1e3).toFixed(2)} µs (> 100 µs threshold)`);
    console.log("       Likely involves: deserialize JSON.parse + scratchpad set/clear + plugin loop");
  } else {
    console.log(`    → confirmed but small — hydration adds ${(delta / 1e3).toFixed(2)} µs (< 100 µs)`);
  }
  if (Math.max(resA.rme, resB.rme) > 5) console.log("  [NOISE] RME > 5% in at least one variant");
}

main().catch(console.error);
